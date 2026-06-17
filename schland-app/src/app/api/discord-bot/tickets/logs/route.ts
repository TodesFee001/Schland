import { NextResponse } from "next/server";

import {
  asRecord,
  asText,
  getDiscordBotAuthError,
  isUuid,
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
  const ticketId = asText(body?.ticketId ?? body?.ticket_id);

  if (ticketId && !isUuid(ticketId)) {
    return NextResponse.json({ error: "ticket_id_invalid" }, { status: 400 });
  }

  const action = asText(body?.action);

  if (!action) {
    return NextResponse.json({ error: "ticket_log_action_required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("discord_ticket_logs")
    .insert({
      action,
      actor_discord_user_id: asText(
        body?.actorDiscordUserId ?? body?.actor_discord_user_id,
      ),
      actor_discord_username: asText(
        body?.actorDiscordUsername ?? body?.actor_discord_username,
      ),
      details: asRecord(body?.details),
      ticket_id: ticketId,
    })
    .select("id,created_at")
    .single();

  if (error) {
    console.error("discord ticket log write failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "ticket_log_write_failed" },
      { status: 500 },
    );
  }

  const log = asRecord(data);

  return NextResponse.json({
    log: {
      createdAt: asText(log.created_at),
      id: asText(log.id),
    },
  });
}
