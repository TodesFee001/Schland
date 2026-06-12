import { NextResponse } from "next/server";

import {
  asIsoDate,
  asRecord,
  asText,
  getDiscordBotAuthError,
  isUuid,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

const ACTION_STATUSES = new Set(["assigning", "active", "ended", "failed"]);

export async function GET(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("member_absence_representations")
    .select(
      `
        id,
        absence_id,
        represented_discord_id,
        representative_discord_id,
        discord_role_id,
        ministry_role_name,
        status,
        representative_had_role_before,
        role_was_assigned_automatically,
        member_absences(reason, requested_by_name, started_at)
      `,
    )
    .in("status", ["pending", "assigning", "ending"])
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error("representation action lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "representation_action_lookup_failed" },
      { status: 500 },
    );
  }

  const rows = (data ?? []).map(asRecord);
  const { data: activeRows, error: activeError } = await supabase
    .from("member_absence_representations")
    .select("id,representative_discord_id,discord_role_id,status")
    .in("status", ["pending", "assigning", "active"]);

  if (activeError) {
    console.error("representation active lookup failed", {
      code: activeError.code,
      details: activeError.details,
      message: activeError.message,
    });

    return NextResponse.json(
      { error: "representation_active_lookup_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    actions: rows.map((row) => mapRepresentationAction(row, activeRows ?? [])),
    queueSize: rows.length,
  });
}

export async function PATCH(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const id = asText(body?.id);
  const status = asText(body?.status);

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "representation_id_required" }, { status: 400 });
  }

  if (!status || !ACTION_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "representation_status_invalid" },
      { status: 400 },
    );
  }

  const representativeHadRoleBefore = readOptionalBoolean(
    body?.representativeHadRoleBefore ?? body?.representative_had_role_before,
  );
  const roleWasAssignedAutomatically = readOptionalBoolean(
    body?.roleWasAssignedAutomatically ?? body?.role_was_assigned_automatically,
  );
  const botError = asText(body?.botError ?? body?.bot_error);
  const assignedAt = asIsoDate(body?.assignedAt ?? body?.assigned_at);
  const removedAt = asIsoDate(body?.removedAt ?? body?.removed_at);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdminClient();

  const updatePayload: Record<string, unknown> = {
    bot_error: status === "failed" ? botError ?? "Bot-Auftrag fehlgeschlagen" : null,
    bot_last_seen_at: now,
    status,
  };

  if (status === "active") {
    updatePayload.assigned_at = assignedAt ?? now;
  }

  if (status === "ended") {
    updatePayload.removed_at = removedAt ?? now;
  }

  if (representativeHadRoleBefore !== null) {
    updatePayload.representative_had_role_before = representativeHadRoleBefore;
  }

  if (roleWasAssignedAutomatically !== null) {
    updatePayload.role_was_assigned_automatically = roleWasAssignedAutomatically;
  }

  const { data, error } = await supabase
    .from("member_absence_representations")
    .update(updatePayload)
    .eq("id", id)
    .select("id,absence_id,status")
    .single();

  if (error) {
    console.error("representation action update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "representation_action_update_failed" },
      { status: 500 },
    );
  }

  if (status === "ended" || status === "failed") {
    await finalizeAbsenceIfReady(supabase, String(data.absence_id ?? ""));
  }

  return NextResponse.json({
    action: {
      absenceId: data.absence_id,
      id: data.id,
      status: data.status,
    },
  });
}

function mapRepresentationAction(
  row: Record<string, unknown>,
  activeRows: unknown[],
) {
  const status = asText(row.status) ?? "pending";
  const absence = asRecord(row.member_absences);
  const representativeDiscordId = asText(row.representative_discord_id);
  const discordRoleId = asText(row.discord_role_id);
  const action = status === "ending" ? "remove" : "assign";

  return {
    action,
    absenceId: asText(row.absence_id),
    discordRoleId,
    id: asText(row.id),
    ministryRoleName: asText(row.ministry_role_name) ?? "Amtsrolle",
    reason: asText(absence.reason) ?? "Abmeldung",
    representedDiscordId: asText(row.represented_discord_id),
    representativeDiscordId,
    requestedByName: asText(absence.requested_by_name) ?? "Schland Verwaltung",
    shouldRemoveRole:
      action === "remove" &&
      row.role_was_assigned_automatically === true &&
      row.representative_had_role_before !== true &&
      representativeDiscordId !== null &&
      discordRoleId !== null &&
      !hasOtherActiveRepresentation(
        activeRows,
        String(row.id ?? ""),
        representativeDiscordId,
        discordRoleId,
      ),
    startedAt: asIsoDate(absence.started_at),
    status,
  };
}

function hasOtherActiveRepresentation(
  rows: unknown[],
  currentId: string,
  representativeDiscordId: string,
  discordRoleId: string,
) {
  return rows.map(asRecord).some((row) => {
    const id = String(row.id ?? "");
    const status = asText(row.status);

    return (
      id !== currentId &&
      (status === "pending" || status === "assigning" || status === "active") &&
      asText(row.representative_discord_id) === representativeDiscordId &&
      asText(row.discord_role_id) === discordRoleId
    );
  });
}

async function finalizeAbsenceIfReady(
  supabase: SupabaseAdminClient,
  absenceId: string,
) {
  if (!absenceId || !isUuid(absenceId)) {
    return;
  }

  const { data, error } = await supabase
    .from("member_absence_representations")
    .select("status")
    .eq("absence_id", absenceId);

  if (error) {
    console.error("absence finalize lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    return;
  }

  const allDone = (data ?? []).every((row) =>
    ["ended", "failed", "skipped"].includes(String(row.status ?? "")),
  );

  if (!allDone) {
    return;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("member_absences")
    .update({
      ended_at: now,
      status: "ended",
    })
    .eq("id", absenceId)
    .neq("status", "ended");

  if (updateError) {
    console.error("absence finalize update failed", {
      code: updateError.code,
      details: updateError.details,
      message: updateError.message,
    });
  }
}

function readOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}
