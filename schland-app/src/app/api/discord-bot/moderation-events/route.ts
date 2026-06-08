import { NextResponse } from "next/server";

import {
  asInteger,
  asIsoDate,
  asRecord,
  asText,
  getDiscordBotAuthError,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set(["ban", "kick", "timeout", "voice_disconnect", "warn"]);
const EVENT_STATUSES = new Set([
  "active",
  "expired",
  "failed",
  "lifted",
  "recorded",
]);

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const discordUserId = asText(body?.discordUserId ?? body?.discord_user_id);
  const eventType = asText(body?.eventType ?? body?.event_type);

  if (!discordUserId) {
    return NextResponse.json(
      { error: "discord_user_id_required" },
      { status: 400 },
    );
  }

  if (!eventType || !EVENT_TYPES.has(eventType)) {
    return NextResponse.json(
      { error: "moderation_event_type_invalid" },
      { status: 400 },
    );
  }

  const requestedStatus = asText(body?.status);
  const status =
    requestedStatus && EVENT_STATUSES.has(requestedStatus)
      ? requestedStatus
      : eventType === "kick" || eventType === "voice_disconnect"
        ? "recorded"
        : eventType === "warn"
        ? "recorded"
        : "active";
  const source = asText(body?.source) ?? "discord";
  const externalEventId = asText(
    body?.externalEventId ?? body?.external_event_id ?? body?.eventId,
  );
  const durationSeconds = asInteger(
    body?.durationSeconds ?? body?.duration_seconds,
  );
  const startedAt = asIsoDate(body?.startedAt ?? body?.started_at);
  const endedAt = asIsoDate(body?.endedAt ?? body?.ended_at);
  const metadata = asRecord(body?.metadata);
  const durationMode = asText(
    body?.durationMode ?? body?.duration_mode ?? metadata.durationMode,
  );
  const requestedLifetime = body?.lifetime ?? metadata.lifetime;
  const lifetime =
    requestedLifetime === true ||
    requestedLifetime === "true" ||
    (eventType === "ban" && durationSeconds === null && !endedAt);

  const supabase = getSupabaseAdminClient();
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("discord_id", discordUserId)
    .maybeSingle();

  if (memberError) {
    console.error("discord bot moderation member lookup failed", {
      code: memberError.code,
      details: memberError.details,
      message: memberError.message,
    });

    return NextResponse.json(
      { error: "moderation_member_lookup_failed" },
      { status: 500 },
    );
  }

  const payload: Record<string, unknown> = {
    channel_id: asText(body?.channelId ?? body?.channel_id),
    channel_name: asText(body?.channelName ?? body?.channel_name),
    discord_user_id: discordUserId,
    discord_username: asText(body?.discordUsername ?? body?.discord_username),
    duration_seconds:
      durationSeconds !== null && durationSeconds >= 0 ? durationSeconds : null,
    ended_at: endedAt,
    event_type: eventType,
    external_event_id: externalEventId,
    last_synced_at: new Date().toISOString(),
    member_id: member?.id ?? null,
    metadata: {
      ...metadata,
      ...(durationMode ? { durationMode } : {}),
      lifetime,
    },
    moderator_discord_id: asText(
      body?.moderatorDiscordId ?? body?.moderator_discord_id,
    ),
    moderator_name: asText(body?.moderatorName ?? body?.moderator_name),
    reason: asText(body?.reason),
    source,
    started_at: startedAt ?? new Date().toISOString(),
    status,
  };

  const writeQuery = externalEventId
    ? supabase
        .from("discord_moderation_events")
        .upsert(payload, { onConflict: "source,external_event_id" })
    : supabase.from("discord_moderation_events").insert(payload);

  const { data, error } = await writeQuery
    .select("id,event_type,status,member_id,last_synced_at")
    .single();

  if (error) {
    console.error("discord bot moderation event write failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "moderation_event_write_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    event: {
      eventType: data.event_type,
      id: data.id,
      lastSyncedAt: data.last_synced_at,
      memberId: data.member_id,
      status: data.status,
    },
  });
}
