import { NextResponse } from "next/server";

import {
  asInteger,
  asRecord,
  asText,
  getDiscordBotAuthError,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const heartbeat = {
    activeVoiceSessions: asInteger(body?.activeVoiceSessions) ?? 0,
    disabledAnalytics: asInteger(body?.disabledAnalytics) ?? 0,
    guildMemberEstimate: asInteger(body?.guildMemberEstimate),
    guildName: asText(body?.guildName),
    humansOnServer: asInteger(body?.humansOnServer),
    lastSeenAt: now,
    lockdownQueueSize: asInteger(body?.lockdownQueueSize) ?? 0,
    messageBufferSize: asInteger(body?.messageBufferSize) ?? 0,
    moderationQueueSize: asInteger(body?.moderationQueueSize) ?? 0,
    questionnaireQueueSize: asInteger(body?.questionnaireQueueSize) ?? 0,
    skippedBots: asInteger(body?.skippedBots),
    uptimeSeconds: asInteger(body?.uptimeSeconds) ?? 0,
  };

  const { data: latest, error: lookupError } = await supabase
    .from("sync_runs")
    .select("id,metadata")
    .eq("source", "discord-live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("discord heartbeat lookup failed", {
      code: lookupError.code,
      details: lookupError.details,
      message: lookupError.message,
    });

    return NextResponse.json(
      { error: "heartbeat_lookup_failed" },
      { status: 500 },
    );
  }

  const previousMetadata = asRecord(latest?.metadata);
  const previousMembers = asRecord(previousMetadata.members);
  const members = {
    ...previousMembers,
    ...(heartbeat.guildMemberEstimate !== null
      ? { guildMemberEstimate: heartbeat.guildMemberEstimate }
      : {}),
    ...(heartbeat.guildName ? { guildName: heartbeat.guildName } : {}),
    ...(heartbeat.humansOnServer !== null
      ? {
          scanned: heartbeat.humansOnServer,
          upserted: heartbeat.humansOnServer,
        }
      : {}),
    ...(heartbeat.skippedBots !== null ? { skippedBots: heartbeat.skippedBots } : {}),
  };
  const metadata = {
    ...previousMetadata,
    heartbeat,
    implementation: "railway-discord-gateway",
    members,
  };

  if (latest?.id) {
    const { error } = await supabase
      .from("sync_runs")
      .update({
        error_message: null,
        finished_at: now,
        metadata,
        status: "success",
      })
      .eq("id", latest.id);

    if (error) {
      console.error("discord heartbeat update failed", {
        code: error.code,
        details: error.details,
        message: error.message,
      });

      return NextResponse.json(
        { error: "heartbeat_update_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ heartbeat });
  }

  const { error } = await supabase.from("sync_runs").insert({
    error_message: null,
    finished_at: now,
    metadata,
    source: "discord-live",
    started_at: now,
    status: "success",
  });

  if (error) {
    console.error("discord heartbeat insert failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "heartbeat_insert_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ heartbeat });
}
