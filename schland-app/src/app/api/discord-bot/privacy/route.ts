import { NextResponse } from "next/server";

import { asRecord, getDiscordBotAuthError } from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select(
      "id,name,discord_id,discord_username,discord_display_name,discord_analytics_enabled,updated_at",
    )
    .not("discord_id", "is", null)
    .order("name", { ascending: true });

  if (error) {
    console.error("discord bot privacy lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "privacy_lookup_failed" },
      { status: 500 },
    );
  }

  const rows = (data ?? []).map((row) => {
    const member = asRecord(row);
    const analyticsEnabled = member.discord_analytics_enabled !== false;

    return {
      analyticsEnabled,
      discordDisplayName: String(member.discord_display_name ?? ""),
      discordId: String(member.discord_id ?? ""),
      discordUsername: String(member.discord_username ?? ""),
      memberId: String(member.id ?? ""),
      name: String(member.name ?? ""),
      updatedAt: String(member.updated_at ?? ""),
    };
  });

  return NextResponse.json({
    disabledDiscordIds: rows
      .filter((member) => !member.analyticsEnabled)
      .map((member) => member.discordId),
    members: rows,
  });
}
