import { NextResponse } from "next/server";

import {
  asInteger,
  asIsoDate,
  asRecord,
  asText,
  getDiscordBotAuthError,
  isUuid,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COMMAND_SOURCE = "schland-web-command";
const COMMAND_STATUSES = new Set(["executed", "failed", "running"]);

export async function GET(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("discord_moderation_events")
    .select(
      `
        id,
        discord_user_id,
        discord_username,
        duration_seconds,
        ended_at,
        event_type,
        member_id,
        metadata,
        moderator_name,
        reason,
        started_at,
        members(name, discord_id, discord_username, discord_display_name)
      `,
    )
    .eq("source", COMMAND_SOURCE)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("discord moderation action lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "moderation_action_lookup_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    actions: (data ?? [])
      .filter((row) => {
        const commandStatus = asText(asRecord(asRecord(row).metadata).commandStatus);

        return commandStatus === "pending" || commandStatus === "running";
      })
      .slice(0, 10)
      .map(mapAction),
  });
}

export async function PATCH(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const id = asText(body?.id);
  const commandStatus = asText(body?.commandStatus ?? body?.command_status);

  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: "moderation_action_id_required" },
      { status: 400 },
    );
  }

  if (!commandStatus || !COMMAND_STATUSES.has(commandStatus)) {
    return NextResponse.json(
      { error: "moderation_action_status_invalid" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: lookupError } = await supabase
    .from("discord_moderation_events")
    .select("id,event_type,duration_seconds,metadata")
    .eq("id", id)
    .eq("source", COMMAND_SOURCE)
    .maybeSingle();

  if (lookupError) {
    console.error("discord moderation action status lookup failed", {
      code: lookupError.code,
      details: lookupError.details,
      message: lookupError.message,
    });

    return NextResponse.json(
      { error: "moderation_action_status_lookup_failed" },
      { status: 500 },
    );
  }

  if (!existing?.id) {
    return NextResponse.json(
      { error: "moderation_action_not_found" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const eventType = asText(existing.event_type) ?? "warn";
  const startedAt = asIsoDate(body?.startedAt ?? body?.started_at) ?? now;
  const durationSeconds = asInteger(
    body?.durationSeconds ?? body?.duration_seconds,
  );
  const endedAt =
    asIsoDate(body?.endedAt ?? body?.ended_at) ??
    (eventType === "timeout" && (durationSeconds ?? existing.duration_seconds)
      ? new Date(
          new Date(startedAt).getTime() +
            Number(durationSeconds ?? existing.duration_seconds) * 1000,
        ).toISOString()
      : null);
  const previousMetadata = asRecord(existing.metadata);
  const botError = asText(body?.botError ?? body?.bot_error);
  const dmError = asText(body?.dmError ?? body?.dm_error);
  const dmStatus = asText(body?.dmStatus ?? body?.dm_status);
  const metadata = {
    ...previousMetadata,
    botError: commandStatus === "failed" ? botError : null,
    commandStatus,
    dmError: dmError ?? previousMetadata.dmError,
    dmStatus: dmStatus ?? previousMetadata.dmStatus,
    executedAt:
      commandStatus === "executed" || commandStatus === "failed"
        ? now
        : previousMetadata.executedAt,
  };
  const eventStatus =
    commandStatus === "failed"
      ? "failed"
      : commandStatus === "running"
        ? asText(body?.status) ?? "recorded"
        : eventType === "ban" || eventType === "timeout"
          ? "active"
          : "recorded";

  const { data, error } = await supabase
    .from("discord_moderation_events")
    .update({
      duration_seconds:
        durationSeconds !== null ? durationSeconds : existing.duration_seconds,
      ended_at: endedAt,
      last_synced_at: now,
      metadata,
      started_at: startedAt,
      status: eventStatus,
    })
    .eq("id", id)
    .select("id,event_type,status,metadata,last_synced_at")
    .single();

  if (error) {
    console.error("discord moderation action status update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "moderation_action_status_update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    action: {
      commandStatus: asRecord(data.metadata).commandStatus,
      eventType: data.event_type,
      id: data.id,
      lastSyncedAt: data.last_synced_at,
      status: data.status,
    },
  });
}

function mapAction(row: unknown) {
  const action = asRecord(row);
  const member = asRecord(action.members);
  const metadata = asRecord(action.metadata);
  const eventType = asText(action.event_type) ?? "warn";
  const durationSeconds = asInteger(action.duration_seconds);
  const startedAt = new Date().toISOString();

  return {
    discordDisplayName: asText(member.discord_display_name),
    discordUserId: String(action.discord_user_id ?? ""),
    discordUsername:
      asText(action.discord_username) ??
      asText(member.discord_username) ??
      asText(member.name),
    durationMode: asText(metadata.durationMode) ?? "lifetime",
    durationSeconds,
    endedAt:
      eventType === "timeout" && durationSeconds
        ? new Date(
            new Date(startedAt).getTime() + durationSeconds * 1000,
          ).toISOString()
        : null,
    eventType,
    id: String(action.id ?? ""),
    memberId: asText(action.member_id),
    moderatorName: asText(action.moderator_name) ?? "Website",
    reason: asText(action.reason) ?? "Schland Moderation",
    startedAt,
  };
}
