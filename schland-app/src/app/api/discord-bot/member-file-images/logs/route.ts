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

const LOG_ACTIONS = new Set([
  "member_join_recorded",
  "request_message_sent",
  "request_message_failed",
  "image_submitted",
  "invalid_response_received",
  "deadline_missed",
  "warning_queued",
  "warning_recorded",
  "request_cancelled",
]);

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const requestId = asText(body?.requestId ?? body?.request_id);
  const action = asText(body?.action);

  if (!requestId || !isUuid(requestId)) {
    return NextResponse.json(
      { error: "member_image_request_id_required" },
      { status: 400 },
    );
  }

  if (!action || !LOG_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "member_image_log_action_invalid" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("member_file_image_request_logs")
    .insert({
      action,
      actor_discord_user_id: asText(
        body?.actorDiscordUserId ?? body?.actor_discord_user_id,
      ),
      details: asRecord(body?.details),
      discord_message_id: asText(body?.messageId ?? body?.message_id),
      request_id: requestId,
    })
    .select("id,created_at")
    .single();

  if (error) {
    console.error("member image log write failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "member_image_log_write_failed" },
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
