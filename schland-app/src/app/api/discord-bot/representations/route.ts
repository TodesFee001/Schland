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
const APPROVAL_STATUSES = new Set(["pending", "accepted", "declined", "failed"]);

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
        approval_status,
        approval_requested_at,
        approval_attempts,
        representative_had_role_before,
        role_was_assigned_automatically,
        member_absences(reason, requested_by_name, started_at, expected_return_at),
        represented:members!member_absence_representations_represented_member_id_fkey(
          name,
          discord_id,
          discord_username,
          discord_display_name
        ),
        representative:members!member_absence_representations_representative_member_id_fkey(
          name,
          discord_id,
          discord_username,
          discord_display_name
        )
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
    .select("id,representative_discord_id,discord_role_id,status,approval_status")
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

  const actions = rows
    .map((row) => mapRepresentationAction(row, activeRows ?? []))
    .filter((action): action is NonNullable<typeof action> => action !== null);

  return NextResponse.json({
    actions,
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
  const approvalStatus = asText(
    body?.approvalStatus ?? body?.approval_status,
  );

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "representation_id_required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  if (approvalStatus) {
    if (!APPROVAL_STATUSES.has(approvalStatus)) {
      return NextResponse.json(
        { error: "representation_approval_status_invalid" },
        { status: 400 },
      );
    }

    return updateRepresentationApproval(supabase, id, approvalStatus, body);
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
  const approvalStatus = asText(row.approval_status) ?? "pending";
  const absence = asRecord(row.member_absences);
  const represented = asRecord(row.represented);
  const representative = asRecord(row.representative);
  const representativeDiscordId = asText(row.representative_discord_id);
  const discordRoleId = asText(row.discord_role_id);
  const action = status === "ending" ? "remove" : "assign";

  if (status !== "ending" && approvalStatus !== "accepted") {
    if (status === "pending" && approvalStatus === "pending" && !row.approval_requested_at) {
      return {
        action: "request_approval",
        absenceId: asText(row.absence_id),
        approvalStatus,
        discordRoleId,
        expectedReturnAt: asIsoDate(absence.expected_return_at),
        id: asText(row.id),
        ministryRoleName: asText(row.ministry_role_name) ?? "Amtsrolle",
        reason: asText(absence.reason) ?? "Abmeldung",
        representedDiscordId: asText(row.represented_discord_id),
        representedName:
          asText(represented.name) ??
          asText(represented.discord_display_name) ??
          asText(represented.discord_username) ??
          asText(row.represented_discord_id) ??
          "Unbekannt",
        representativeDiscordId,
        representativeName:
          asText(representative.name) ??
          asText(representative.discord_display_name) ??
          asText(representative.discord_username) ??
          representativeDiscordId ??
          "Unbekannt",
        requestedByName: asText(absence.requested_by_name) ?? "Schland Verwaltung",
        startedAt: asIsoDate(absence.started_at),
        status,
      };
    }

    return null;
  }

  return {
    action,
    absenceId: asText(row.absence_id),
    approvalStatus,
    discordRoleId,
    expectedReturnAt: asIsoDate(absence.expected_return_at),
    id: asText(row.id),
    ministryRoleName: asText(row.ministry_role_name) ?? "Amtsrolle",
    reason: asText(absence.reason) ?? "Abmeldung",
    representedDiscordId: asText(row.represented_discord_id),
    representedName:
      asText(represented.name) ??
      asText(represented.discord_display_name) ??
      asText(represented.discord_username) ??
      asText(row.represented_discord_id) ??
      "Unbekannt",
    representativeDiscordId,
    representativeName:
      asText(representative.name) ??
      asText(representative.discord_display_name) ??
      asText(representative.discord_username) ??
      representativeDiscordId ??
      "Unbekannt",
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
    const approvalStatus = asText(row.approval_status) ?? "accepted";
    const keepsRoleActive =
      status === "active" ||
      status === "assigning" ||
      (status === "pending" && approvalStatus === "accepted");

    return (
      id !== currentId &&
      keepsRoleActive &&
      asText(row.representative_discord_id) === representativeDiscordId &&
      asText(row.discord_role_id) === discordRoleId
    );
  });
}

async function updateRepresentationApproval(
  supabase: SupabaseAdminClient,
  id: string,
  approvalStatus: string,
  body: Record<string, unknown> | null,
) {
  const current = await getRepresentationApprovalRow(supabase, id);

  if (!current) {
    return NextResponse.json({ error: "representation_not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (approvalStatus === "pending") {
    const { data, error } = await supabase
      .from("member_absence_representations")
      .update({
        approval_attempts: Number(current.approval_attempts ?? 0) + 1,
        approval_channel_id: asText(body?.approvalChannelId ?? body?.approval_channel_id),
        approval_error: null,
        approval_message_id: asText(body?.approvalMessageId ?? body?.approval_message_id),
        approval_requested_at: asIsoDate(
          body?.approvalRequestedAt ?? body?.approval_requested_at,
        ) ?? now,
        approval_status: "pending",
        bot_last_seen_at: now,
      })
      .eq("id", id)
      .select("id,absence_id,status,approval_status")
      .single();

    if (error) {
      console.error("representation approval request update failed", {
        code: error.code,
        details: error.details,
        message: error.message,
      });

      return NextResponse.json(
        { error: "representation_approval_update_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ action: data });
  }

  if (approvalStatus === "accepted") {
    const respondentDiscordId = asText(
      body?.respondentDiscordId ?? body?.respondent_discord_id,
    );

    if (!isExpectedRepresentative(current, respondentDiscordId)) {
      return NextResponse.json(
        { error: "representation_approval_wrong_user" },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("member_absence_representations")
      .update({
        approval_error: null,
        approval_responded_at: now,
        approval_status: "accepted",
        bot_error: null,
        bot_last_seen_at: now,
        status: "pending",
      })
      .eq("id", id)
      .select("id,absence_id,status,approval_status")
      .single();

    if (error) {
      console.error("representation approval accept update failed", {
        code: error.code,
        details: error.details,
        message: error.message,
      });

      return NextResponse.json(
        { error: "representation_approval_update_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ action: data });
  }

  if (approvalStatus === "declined") {
    const respondentDiscordId = asText(
      body?.respondentDiscordId ?? body?.respondent_discord_id,
    );

    if (!isExpectedRepresentative(current, respondentDiscordId)) {
      return NextResponse.json(
        { error: "representation_approval_wrong_user" },
        { status: 403 },
      );
    }

    try {
      return await replaceDeclinedRepresentative(supabase, current, now);
    } catch (error) {
      console.error("representation replacement lookup failed", {
        message: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json(
        { error: "representation_replacement_lookup_failed" },
        { status: 500 },
      );
    }
  }

  const botError =
    asText(body?.botError ?? body?.bot_error ?? body?.approvalError ?? body?.approval_error) ??
    "Zustimmungs-DM konnte nicht zugestellt werden.";
  const { data, error } = await supabase
    .from("member_absence_representations")
    .update({
      approval_error: botError,
      approval_status: "failed",
      bot_error: botError,
      bot_last_seen_at: now,
      status: "failed",
    })
    .eq("id", id)
    .select("id,absence_id,status,approval_status")
    .single();

  if (error) {
    console.error("representation approval failure update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "representation_approval_update_failed" },
      { status: 500 },
    );
  }

  await finalizeAbsenceIfReady(supabase, String(data.absence_id ?? ""));

  return NextResponse.json({ action: data });
}

async function getRepresentationApprovalRow(
  supabase: SupabaseAdminClient,
  id: string,
) {
  const { data, error } = await supabase
    .from("member_absence_representations")
    .select(
      `
        id,
        absence_id,
        represented_member_id,
        represented_discord_id,
        representative_member_id,
        representative_discord_id,
        ministry_role_id,
        discord_role_id,
        ministry_role_name,
        status,
        approval_attempts,
        declined_representative_discord_ids
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("representation approval row lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    return null;
  }

  return data ? asRecord(data) : null;
}

function isExpectedRepresentative(
  row: Record<string, unknown>,
  respondentDiscordId: string | null,
) {
  return (
    respondentDiscordId !== null &&
    asText(row.representative_discord_id) === respondentDiscordId
  );
}

async function replaceDeclinedRepresentative(
  supabase: SupabaseAdminClient,
  current: Record<string, unknown>,
  now: string,
) {
  const currentId = asText(current.id);

  if (!currentId) {
    return NextResponse.json(
      { error: "representation_id_required" },
      { status: 400 },
    );
  }

  const declinedDiscordIds = new Set([
    ...asTextArray(current.declined_representative_discord_ids),
    asText(current.representative_discord_id) ?? "",
  ].filter(Boolean));
  const candidate = await findReplacementRepresentative(supabase, current, declinedDiscordIds);

  if (!candidate) {
    const { data, error } = await supabase
      .from("member_absence_representations")
      .update({
        approval_error: "Vertretung abgelehnt. Keine Ersatzvertretung frei.",
        approval_responded_at: now,
        approval_status: "declined",
        bot_error: "Vertretung abgelehnt. Keine Ersatzvertretung frei.",
        bot_last_seen_at: now,
        declined_representative_discord_ids: [...declinedDiscordIds],
        status: "failed",
      })
      .eq("id", currentId)
      .select("id,absence_id,status,approval_status")
      .single();

    if (error) {
      console.error("representation decline final update failed", {
        code: error.code,
        details: error.details,
        message: error.message,
      });

      return NextResponse.json(
        { error: "representation_replacement_update_failed" },
        { status: 500 },
      );
    }

    await finalizeAbsenceIfReady(supabase, String(data.absence_id ?? ""));

    return NextResponse.json({
      action: data,
      replacementFound: false,
    });
  }

  const { data, error } = await supabase
    .from("member_absence_representations")
    .update({
      approval_channel_id: null,
      approval_error: null,
      approval_message_id: null,
      approval_requested_at: null,
      approval_responded_at: null,
      approval_status: "pending",
      assigned_at: null,
      bot_error: null,
      bot_last_seen_at: now,
      declined_representative_discord_ids: [...declinedDiscordIds],
      removed_at: null,
      representative_discord_id: candidate.discordId,
      representative_had_role_before: false,
      representative_member_id: candidate.memberId,
      role_was_assigned_automatically: false,
      status: "pending",
    })
    .eq("id", currentId)
    .select("id,absence_id,status,approval_status,representative_discord_id")
    .single();

  if (error) {
    console.error("representation replacement update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "representation_replacement_update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    action: data,
    replacementFound: true,
    replacementDiscordId: candidate.discordId,
    replacementName: candidate.name,
  });
}

async function findReplacementRepresentative(
  supabase: SupabaseAdminClient,
  current: Record<string, unknown>,
  declinedDiscordIds: Set<string>,
) {
  const representedMemberId = asText(current.represented_member_id);
  const representedDiscordId = asText(current.represented_discord_id);
  const ministryRoleId = asText(current.ministry_role_id);

  if (!representedMemberId || !representedDiscordId || !ministryRoleId) {
    return null;
  }

  const [eligibilitiesResult, absencesResult, busyRepresentationsResult] =
    await Promise.all([
      supabase
        .from("representation_eligibilities")
        .select(
          `
            id,
            representative_member_id,
            representative_discord_id,
            active,
            priority,
            members(id, name, discord_id, discord_username, discord_display_name, discord_on_server),
            representation_eligibility_ministry_roles(ministry_role_id)
          `,
        )
        .eq("active", true)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("member_absences")
        .select("member_id")
        .in("status", ["active", "ending"]),
      supabase
        .from("member_absence_representations")
        .select("id,representative_member_id,representative_discord_id,status")
        .in("status", ["pending", "assigning", "active", "ending"]),
    ]);

  if (eligibilitiesResult.error) {
    throw new Error(eligibilitiesResult.error.message);
  }

  if (absencesResult.error) {
    throw new Error(absencesResult.error.message);
  }

  if (busyRepresentationsResult.error) {
    throw new Error(busyRepresentationsResult.error.message);
  }

  const currentId = asText(current.id) ?? "";
  const absentMemberIds = new Set(
    (absencesResult.data ?? [])
      .map((row) => String(row.member_id ?? ""))
      .filter(Boolean),
  );
  const busyMemberIds = new Set(
    (busyRepresentationsResult.data ?? [])
      .filter((row) => String(row.id ?? "") !== currentId)
      .map((row) => String(row.representative_member_id ?? ""))
      .filter(Boolean),
  );
  const busyDiscordIds = new Set(
    (busyRepresentationsResult.data ?? [])
      .filter((row) => String(row.id ?? "") !== currentId)
      .map((row) => String(row.representative_discord_id ?? ""))
      .filter(Boolean),
  );

  for (const row of (eligibilitiesResult.data ?? []).map(asRecord)) {
    const allowedRoleIds = asTextArray(
      row.representation_eligibility_ministry_roles,
      "ministry_role_id",
    );
    const representative = asRecord(row.members);
    const memberId = asText(row.representative_member_id) ?? asText(representative.id);
    const discordId =
      asText(representative.discord_id) ??
      asText(row.representative_discord_id);

    if (
      allowedRoleIds.includes(ministryRoleId) &&
      memberId &&
      memberId !== representedMemberId &&
      discordId &&
      discordId !== representedDiscordId &&
      representative.discord_on_server === true &&
      !absentMemberIds.has(memberId) &&
      !busyMemberIds.has(memberId) &&
      !busyDiscordIds.has(discordId) &&
      !declinedDiscordIds.has(discordId)
    ) {
      return {
        discordId,
        memberId,
        name:
          asText(representative.name) ??
          asText(representative.discord_display_name) ??
          asText(representative.discord_username) ??
          discordId,
      };
    }
  }

  return null;
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

function asTextArray(value: unknown, objectKey?: string) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (objectKey) {
        return asText(asRecord(entry)[objectKey]);
      }

      return asText(entry);
    })
    .filter((entry): entry is string => Boolean(entry));
}
