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

const COMMAND_STATUSES = new Set(["executed", "failed", "running"]);

export async function GET(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("discord_lockdown_commands")
    .select(
      `
        id,
        action,
        status,
        reason,
        emergency_code,
        triggered_by_name,
        recipient_discord_ids,
        recipient_usernames,
        important_channel_ids,
        bot_error,
        metadata,
        created_at
      `,
    )
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    console.error("discord lockdown command lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "lockdown_command_lookup_failed" },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  const needsRestoreSnapshot = rows.some(
    (row) => asText(asRecord(row).action) === "deactivate",
  );
  const restoreSnapshot = needsRestoreSnapshot
    ? await getLatestLockdownSnapshot()
    : [];

  return NextResponse.json({
    commands: rows.map((row) => mapCommand(row, restoreSnapshot)),
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
    return NextResponse.json(
      { error: "lockdown_command_id_required" },
      { status: 400 },
    );
  }

  if (!status || !COMMAND_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "lockdown_command_status_invalid" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: lookupError } = await supabase
    .from("discord_lockdown_commands")
    .select("id,action,metadata")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    console.error("discord lockdown command status lookup failed", {
      code: lookupError.code,
      details: lookupError.details,
      message: lookupError.message,
    });

    return NextResponse.json(
      { error: "lockdown_command_status_lookup_failed" },
      { status: 500 },
    );
  }

  if (!existing?.id) {
    return NextResponse.json(
      { error: "lockdown_command_not_found" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const action = asText(asRecord(existing).action) ?? "activate";
  const previousMetadata = asRecord(asRecord(existing).metadata);
  const botError = asText(body?.botError ?? body?.bot_error);
  const metadata = {
    ...previousMetadata,
    botError: status === "failed" ? botError : null,
    channelSummary: body?.channelSummary ?? previousMetadata.channelSummary,
    executedAt:
      status === "executed" || status === "failed"
        ? now
        : previousMetadata.executedAt,
    recipientStatus: body?.recipientStatus ?? previousMetadata.recipientStatus,
    snapshot: body?.snapshot ?? previousMetadata.snapshot,
    status,
  };
  const startedAt = asIsoDate(body?.startedAt ?? body?.started_at) ?? now;
  const update: Record<string, unknown> = {
    bot_error: status === "failed" ? botError : null,
    metadata,
    status,
  };

  if (status === "running") {
    update.started_at = startedAt;
  }

  if (status === "executed" || status === "failed") {
    update.finished_at = now;
  }

  if (status === "executed" && action === "activate") {
    update.emergency_code = null;
  }

  const { data, error } = await supabase
    .from("discord_lockdown_commands")
    .update(update)
    .eq("id", id)
    .select("id,action,status,bot_error,metadata,updated_at")
    .single();

  if (error) {
    console.error("discord lockdown command status update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "lockdown_command_status_update_failed" },
      { status: 500 },
    );
  }

  await updateLockdownBotState(action, status, botError);

  return NextResponse.json({
    command: {
      action: data.action,
      botError: data.bot_error,
      id: data.id,
      status: data.status,
      updatedAt: data.updated_at,
    },
  });
}

async function getLatestLockdownSnapshot() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("discord_lockdown_commands")
    .select("metadata")
    .eq("action", "activate")
    .eq("status", "executed")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("discord lockdown snapshot lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return [];
  }

  const snapshot = asRecord(asRecord(data).metadata).snapshot;

  return Array.isArray(snapshot) ? snapshot : [];
}

async function updateLockdownBotState(
  action: string,
  status: string,
  botError: string | null,
) {
  const supabase = getSupabaseAdminClient();
  const botStatus =
    status === "failed"
      ? action === "deactivate"
        ? "restore_failed"
        : "failed"
      : status === "running"
        ? action === "deactivate"
          ? "restoring"
          : "locking"
        : action === "deactivate"
          ? "idle"
          : "locked";

  const { error } = await supabase
    .from("lockdown_state")
    .update({
      bot_error: status === "failed" ? botError : null,
      bot_status: botStatus,
    })
    .eq("id", true);

  if (error) {
    console.error("lockdown bot state update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
  }
}

function mapCommand(row: unknown, restoreSnapshot: unknown[]) {
  const command = asRecord(row);
  const action = asText(command.action) ?? "activate";

  return {
    action,
    botError: asText(command.bot_error),
    createdAt: String(command.created_at ?? ""),
    emergencyCode: action === "activate" ? asText(command.emergency_code) : null,
    id: String(command.id ?? ""),
    importantChannelIds: asTextArray(command.important_channel_ids),
    reason: asText(command.reason) ?? "Schland Lockdown",
    recipientDiscordIds: asTextArray(command.recipient_discord_ids),
    recipientUsernames: asTextArray(command.recipient_usernames),
    repairMode: asText(asRecord(command.metadata).repairMode),
    restoreSnapshot: action === "deactivate" ? restoreSnapshot : [],
    restoreFrom: asText(asRecord(command.metadata).restoreFrom),
    restoreUntil: asText(asRecord(command.metadata).restoreUntil),
    status: String(command.status ?? "pending"),
    triggeredByName: asText(command.triggered_by_name) ?? "Schland Verwaltung",
  };
}

function asTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asText(item))
    .filter((item): item is string => Boolean(item));
}
