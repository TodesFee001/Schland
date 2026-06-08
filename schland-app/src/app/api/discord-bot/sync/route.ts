import { NextResponse } from "next/server";

import { getCronAuthError } from "@/lib/discord-bot-api";
import { runDiscordSync } from "@/lib/discord-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = getCronAuthError(request);

  if (authError) {
    return authError;
  }

  try {
    const summary = await runDiscordSync("cron");

    return NextResponse.json(summary, {
      status: summary.status === "failed" ? 500 : 200,
    });
  } catch (error) {
    console.error("discord cron sync failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "discord_sync_failed", status: "failed" },
      { status: 500 },
    );
  }
}
