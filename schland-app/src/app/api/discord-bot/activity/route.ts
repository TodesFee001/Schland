import { NextResponse } from "next/server";

import {
  asInteger,
  asIsoDate,
  asText,
  getDiscordBotAuthError,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set(["message", "voice_session"]);

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const eventType = asText(body?.eventType ?? body?.event_type);
  const discordUserId = asText(
    body?.discordUserId ?? body?.discord_user_id ?? body?.userId,
  );
  const isBot = Boolean(body?.isBot ?? body?.bot ?? false);

  if (!discordUserId) {
    return NextResponse.json(
      { error: "discord_user_id_required" },
      { status: 400 },
    );
  }

  if (!eventType || !EVENT_TYPES.has(eventType)) {
    return NextResponse.json(
      { error: "activity_event_type_invalid" },
      { status: 400 },
    );
  }

  if (isBot) {
    return NextResponse.json({ skipped: "bot" });
  }

  const supabase = getSupabaseAdminClient();
  const member = await getOrCreateActivityMember(supabase, body, discordUserId);

  if (!member.discord_analytics_enabled) {
    return NextResponse.json({
      memberId: member.id,
      skipped: "analytics_disabled",
    });
  }

  if (eventType === "message") {
    const occurredAt =
      asIsoDate(body?.occurredAt ?? body?.occurred_at) ?? new Date().toISOString();
    const count = Math.max(asInteger(body?.count) ?? 1, 1);
    await addMessageActivity(supabase, member.id, occurredAt, count);

    return NextResponse.json({
      eventType,
      memberId: member.id,
      recorded: count,
    });
  }

  const startedAt =
    asIsoDate(body?.startedAt ?? body?.started_at) ?? new Date().toISOString();
  const endedAt = asIsoDate(body?.endedAt ?? body?.ended_at);
  const durationSeconds =
    asInteger(body?.durationSeconds ?? body?.duration_seconds) ??
    getDurationSeconds(startedAt, endedAt);
  const durationMinutes = Math.max(Math.round((durationSeconds ?? 0) / 60), 0);

  if (durationMinutes <= 0) {
    return NextResponse.json(
      { error: "voice_duration_required" },
      { status: 400 },
    );
  }

  await addVoiceActivity(supabase, {
    channelId: asText(body?.channelId ?? body?.channel_id) ?? "unknown",
    channelName: asText(body?.channelName ?? body?.channel_name),
    durationMinutes,
    endedAt,
    memberId: member.id,
    startedAt,
  });

  return NextResponse.json({
    durationMinutes,
    eventType,
    memberId: member.id,
    recorded: true,
  });
}

async function getOrCreateActivityMember(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  body: Record<string, unknown> | null,
  discordUserId: string,
) {
  const username = asText(
    body?.discordUsername ?? body?.discord_username ?? body?.username,
  );
  const displayName = asText(
    body?.discordDisplayName ??
      body?.discord_display_name ??
      body?.displayName ??
      body?.globalName ??
      body?.nick,
  );
  const name = displayName ?? username ?? discordUserId;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("members")
    .upsert(
      {
        discord_display_name: displayName,
        discord_id: discordUserId,
        discord_is_bot: false,
        discord_last_seen_at: now,
        discord_on_server: true,
        discord_username: username,
        name,
        notes: "Automatisch durch Discord-Aktivitaet angelegt.",
      },
      { onConflict: "discord_id" },
    )
    .select("id,discord_analytics_enabled")
    .single();

  if (error) {
    throw new Error(`activity member upsert failed: ${error.message}`);
  }

  return {
    discord_analytics_enabled: data.discord_analytics_enabled !== false,
    id: String(data.id),
  };
}

async function addMessageActivity(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  memberId: string,
  occurredAt: string,
  count: number,
) {
  const date = new Date(occurredAt);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const { data: existing, error: lookupError } = await supabase
    .from("message_activity_monthly")
    .select("id,message_count")
    .eq("member_id", memberId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`message activity lookup failed: ${lookupError.message}`);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("message_activity_monthly")
      .update({
        last_message_at: occurredAt,
        message_count: Number(existing.message_count ?? 0) + count,
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(`message activity update failed: ${error.message}`);
    }
  } else {
    const { error } = await supabase.from("message_activity_monthly").insert({
      last_message_at: occurredAt,
      member_id: memberId,
      message_count: count,
      month,
      year,
    });

    if (error) {
      throw new Error(`message activity insert failed: ${error.message}`);
    }
  }
}

async function addVoiceActivity(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    channelId: string;
    channelName: string | null;
    durationMinutes: number;
    endedAt: string | null;
    memberId: string;
    startedAt: string;
  },
) {
  const { error: sessionError } = await supabase.from("voice_sessions").insert({
    channel_id: input.channelId,
    channel_name: input.channelName,
    duration_minutes: input.durationMinutes,
    ended_at: input.endedAt,
    member_id: input.memberId,
    started_at: input.startedAt,
  });

  if (sessionError) {
    throw new Error(`voice session insert failed: ${sessionError.message}`);
  }

  const date = new Date(input.startedAt);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const { data: existing, error: lookupError } = await supabase
    .from("voice_activity_monthly")
    .select("id,voice_minutes")
    .eq("member_id", input.memberId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`voice activity lookup failed: ${lookupError.message}`);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("voice_activity_monthly")
      .update({
        last_voice_at: input.endedAt ?? input.startedAt,
        voice_minutes: Number(existing.voice_minutes ?? 0) + input.durationMinutes,
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(`voice activity update failed: ${error.message}`);
    }
  } else {
    const { error } = await supabase.from("voice_activity_monthly").insert({
      last_voice_at: input.endedAt ?? input.startedAt,
      member_id: input.memberId,
      month,
      voice_minutes: input.durationMinutes,
      year,
    });

    if (error) {
      throw new Error(`voice activity insert failed: ${error.message}`);
    }
  }
}

function getDurationSeconds(startedAt: string, endedAt: string | null) {
  if (!endedAt) {
    return null;
  }

  const started = new Date(startedAt).getTime();
  const ended = new Date(endedAt).getTime();

  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) {
    return null;
  }

  return Math.round((ended - started) / 1000);
}
