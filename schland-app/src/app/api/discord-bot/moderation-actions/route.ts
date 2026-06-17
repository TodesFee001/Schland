import { NextResponse } from "next/server";

import {
  markModerationAdviceExecutionResult,
  MODERATION_ADVICE_COMMAND_SOURCE,
} from "@/lib/moderation-advice";
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
const MEMBER_FILE_IMAGE_COMMAND_SOURCE = "schland-member-file-image-policy";
const COMMAND_SOURCES = [
  COMMAND_SOURCE,
  MEMBER_FILE_IMAGE_COMMAND_SOURCE,
  MODERATION_ADVICE_COMMAND_SOURCE,
];
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
    .in("source", COMMAND_SOURCES)
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
    .select("id,event_type,duration_seconds,metadata,source")
    .eq("id", id)
    .in("source", COMMAND_SOURCES)
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

  if (existing.source === MODERATION_ADVICE_COMMAND_SOURCE) {
    await markModerationAdviceExecutionResult({
      botError,
      commandStatus: commandStatus as "executed" | "failed" | "running",
      eventId: id,
    });
  }

  if (existing.source === MEMBER_FILE_IMAGE_COMMAND_SOURCE) {
    await markMemberImageWarningExecutionResult(supabase, {
      botError,
      commandStatus: commandStatus as "executed" | "failed" | "running",
      eventId: id,
      metadata: previousMetadata,
    });
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

async function markMemberImageWarningExecutionResult(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    botError: string | null;
    commandStatus: "executed" | "failed" | "running";
    eventId: string;
    metadata: Record<string, unknown>;
  },
) {
  const requestId = asText(input.metadata.memberFileImageRequestId);

  if (!requestId || !isUuid(requestId)) {
    return;
  }

  const status =
    input.commandStatus === "executed" ? "warning_recorded" : "warning_queued";
  const { error } = await supabase
    .from("member_file_image_requests")
    .update({
      last_error:
        input.commandStatus === "failed"
          ? input.botError ?? "warning_execution_failed"
          : null,
      status,
      warning_event_id: input.eventId,
    })
    .eq("id", requestId);

  if (error) {
    console.error("member image warning status update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return;
  }

  if (input.commandStatus !== "executed") {
    return;
  }

  const { error: logError } = await supabase
    .from("member_file_image_request_logs")
    .insert({
      action: "warning_recorded",
      details: {
        eventId: input.eventId,
      },
      request_id: requestId,
    });

  if (logError) {
    console.error("member image warning log failed", {
      code: logError.code,
      details: logError.details,
      message: logError.message,
    });
  }
}
