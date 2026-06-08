import { NextResponse } from "next/server";

import {
  asIsoDate,
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

  if (isBot) {
    return NextResponse.json({
      member: null,
      skipped: "bot",
    });
  }

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
  const joinedAt = asIsoDate(body?.joinedAt ?? body?.joined_at);
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("members")
    .upsert(
      {
        discord_display_name: displayName,
        discord_id: discordUserId,
        discord_is_bot: false,
        discord_joined_at: joinedAt,
        discord_last_seen_at: now,
        discord_on_server: true,
        discord_username: username,
        name,
        notes: "Automatisch durch Discord-Bot angelegt.",
      },
      { onConflict: "discord_id" },
    )
    .select("id,name,discord_id,discord_username,discord_display_name")
    .single();

  if (error) {
    console.error("discord bot member upsert failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "member_write_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    member: {
      discordDisplayName: data.discord_display_name,
      discordId: data.discord_id,
      discordUsername: data.discord_username,
      id: data.id,
      name: data.name,
    },
  });
}
