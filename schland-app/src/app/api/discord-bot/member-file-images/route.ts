import { NextResponse } from "next/server";

import {
  asIsoDate,
  asRecord,
  asText,
  getDiscordBotAuthError,
  isUuid,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = [
  "pending",
  "message_due",
  "message_sent",
  "invalid_response",
  "overdue",
  "warning_queued",
];
const DUE_STATUSES = ["pending", "message_due"];
const DEADLINE_STATUSES = ["message_sent", "invalid_response"];
const WARNING_SOURCE = "schland-member-file-image-policy";

export async function GET(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const { searchParams } = new URL(request.url);
  const discordUserId = asText(searchParams.get("discordUserId"));
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 50);
  const supabase = getSupabaseAdminClient();

  if (discordUserId) {
    const { data, error } = await supabase
      .from("member_file_image_requests")
      .select("*")
      .eq("discord_user_id", discordUserId)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "member_image_request_lookup_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      request: data ? mapRequest(data) : null,
    });
  }

  const now = new Date().toISOString();
  const [dueResult, overdueResult] = await Promise.all([
    supabase
      .from("member_file_image_requests")
      .select("*")
      .in("status", DUE_STATUSES)
      .lte("message_due_at", now)
      .order("message_due_at", { ascending: true })
      .limit(limit),
    supabase
      .from("member_file_image_requests")
      .select("*")
      .in("status", DEADLINE_STATUSES)
      .lte("deadline_at", now)
      .order("deadline_at", { ascending: true })
      .limit(limit),
  ]);

  if (dueResult.error || overdueResult.error) {
    console.error("member image queue lookup failed", {
      due: dueResult.error?.message,
      overdue: overdueResult.error?.message,
    });

    return NextResponse.json(
      { error: "member_image_queue_lookup_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    due: (dueResult.data ?? []).map(mapRequest),
    overdue: (overdueResult.data ?? []).map(mapRequest),
  });
}

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const guildId = asText(body?.guildId ?? body?.guild_id);
  const discordUserId = asText(body?.discordUserId ?? body?.discord_user_id);
  const joinedAt = asIsoDate(body?.joinedAt ?? body?.joined_at);
  const messageDueAt = asIsoDate(body?.messageDueAt ?? body?.message_due_at);

  if (!guildId || !discordUserId || !joinedAt || !messageDueAt) {
    return NextResponse.json(
      { error: "member_image_request_data_required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const memberId = await ensureMemberForRequest(supabase, {
    discordUserId,
    discordUsername: asText(body?.discordUsername ?? body?.discord_username),
  });
  const existing = await findActiveRequest(supabase, guildId, discordUserId);

  if (existing?.id) {
    return NextResponse.json({
      request: mapRequest(existing),
      reused: true,
    });
  }

  const { data, error } = await supabase
    .from("member_file_image_requests")
    .insert({
      discord_user_id: discordUserId,
      discord_username: asText(body?.discordUsername ?? body?.discord_username),
      guild_id: guildId,
      joined_at: joinedAt,
      member_id: memberId,
      message_due_at: messageDueAt,
      metadata: asRecord(body?.metadata),
      status: "pending",
    })
    .select("*")
    .single();
  const insertedRequestId = asText(asRecord(data).id);

  if (error || !insertedRequestId) {
    console.error("member image request insert failed", {
      code: error?.code,
      details: error?.details,
      message: error?.message,
    });

    return NextResponse.json(
      { error: "member_image_request_insert_failed" },
      { status: 500 },
    );
  }

  await writeRequestLog(supabase, {
    action: "member_join_recorded",
    details: { joinedAt, messageDueAt },
    requestId: insertedRequestId,
  });

  return NextResponse.json({ request: mapRequest(data) });
}

export async function PATCH(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const action = asText(body?.action);
  const supabase = getSupabaseAdminClient();
  const requestRow = await findRequestForMutation(supabase, body);

  if (!requestRow) {
    return NextResponse.json(
      { error: "member_image_request_not_found" },
      { status: 404 },
    );
  }

  const requestId = asText(requestRow.id);

  if (!requestId) {
    return NextResponse.json(
      { error: "member_image_request_not_found" },
      { status: 404 },
    );
  }

  if (action === "message_sent") {
    const messageSentAt =
      asIsoDate(body?.messageSentAt ?? body?.message_sent_at) ??
      new Date().toISOString();
    const deadlineAt =
      asIsoDate(body?.deadlineAt ?? body?.deadline_at) ??
      new Date(new Date(messageSentAt).getTime() + 48 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("member_file_image_requests")
      .update({
        deadline_at: deadlineAt,
        message_sent_at: messageSentAt,
        request_message_id: asText(body?.messageId ?? body?.message_id),
        status: "message_sent",
      })
      .eq("id", requestId)
      .select("*")
      .single();

    if (error) {
      return writeFailed(error.message);
    }

    await writeRequestLog(supabase, {
      action: "request_message_sent",
      details: { deadlineAt, messageSentAt },
      discordMessageId: asText(body?.messageId ?? body?.message_id),
      requestId,
    });

    return NextResponse.json({ request: mapRequest(data) });
  }

  if (action === "dm_failed") {
    const { data, error } = await supabase
      .from("member_file_image_requests")
      .update({
        last_error: asText(body?.error) ?? "dm_failed",
        status: "dm_failed",
      })
      .eq("id", requestId)
      .select("*")
      .single();

    if (error) {
      return writeFailed(error.message);
    }

    await writeRequestLog(supabase, {
      action: "request_message_failed",
      details: { error: asText(body?.error) },
      requestId,
    });

    return NextResponse.json({ request: mapRequest(data) });
  }

  if (action === "invalid_response") {
    const { data, error } = await supabase
      .from("member_file_image_requests")
      .update({
        metadata: {
          ...asRecord(requestRow.metadata),
          lastInvalidResponseAt: new Date().toISOString(),
          lastInvalidResponse: asRecord(body?.details),
        },
        status: "invalid_response",
      })
      .eq("id", requestId)
      .select("*")
      .single();

    if (error) {
      return writeFailed(error.message);
    }

    await writeRequestLog(supabase, {
      action: "invalid_response_received",
      actorDiscordUserId: asText(body?.discordUserId ?? body?.discord_user_id),
      details: asRecord(body?.details),
      discordMessageId: asText(body?.messageId ?? body?.message_id),
      requestId,
    });

    return NextResponse.json({ request: mapRequest(data) });
  }

  if (action === "mark_overdue") {
    const warningEventId = await queueWarningEvent(supabase, requestRow);
    const { data, error } = await supabase
      .from("member_file_image_requests")
      .update({
        status: warningEventId ? "warning_queued" : "overdue",
        warning_event_id: warningEventId,
      })
      .eq("id", requestId)
      .select("*")
      .single();

    if (error) {
      return writeFailed(error.message);
    }

    await writeRequestLog(supabase, {
      action: "deadline_missed",
      details: { warningEventId },
      requestId,
    });

    if (warningEventId) {
      await writeRequestLog(supabase, {
        action: "warning_queued",
        details: {
          reason:
            "Mitgliederaktenbild nicht innerhalb von 48 Stunden nach Aufforderung eingereicht.",
          warningEventId,
        },
        requestId,
      });
    }

    return NextResponse.json({ request: mapRequest(data), warningEventId });
  }

  return NextResponse.json({ error: "member_image_action_invalid" }, { status: 400 });
}

async function ensureMemberForRequest(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: { discordUserId: string; discordUsername: string | null },
) {
  const { data: existing, error: lookupError } = await supabase
    .from("members")
    .select("id")
    .eq("discord_id", input.discordUserId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`member image member lookup failed: ${lookupError.message}`);
  }

  if (existing?.id) {
    return String(existing.id);
  }

  const { data, error } = await supabase
    .from("members")
    .insert({
      discord_id: input.discordUserId,
      discord_is_bot: false,
      discord_on_server: true,
      discord_username: input.discordUsername,
      name: input.discordUsername ?? input.discordUserId,
      notes: "Automatisch durch Mitgliederaktenbild-Anforderung angelegt.",
    })
    .select("id")
    .single();
  const insertedMemberId = asText(asRecord(data).id);

  if (error || !insertedMemberId) {
    throw new Error(error?.message ?? "member image member insert failed");
  }

  return insertedMemberId;
}

async function findActiveRequest(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  guildId: string,
  discordUserId: string,
) {
  const { data, error } = await supabase
    .from("member_file_image_requests")
    .select("*")
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordUserId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`member image active lookup failed: ${error.message}`);
  }

  return data ? asRecord(data) : null;
}

async function findRequestForMutation(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  body: Record<string, unknown> | null,
) {
  const requestId = asText(body?.requestId ?? body?.request_id);

  if (requestId) {
    if (!isUuid(requestId)) {
      return null;
    }

    const { data, error } = await supabase
      .from("member_file_image_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (error) {
      throw new Error(`member image mutation lookup failed: ${error.message}`);
    }

    return data ? asRecord(data) : null;
  }

  const discordUserId = asText(body?.discordUserId ?? body?.discord_user_id);
  const guildId = asText(body?.guildId ?? body?.guild_id);

  if (!discordUserId || !guildId) {
    return null;
  }

  return findActiveRequest(supabase, guildId, discordUserId);
}

async function queueWarningEvent(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  requestRow: Record<string, unknown>,
) {
  const discordUserId = asText(requestRow.discord_user_id);
  const requestId = asText(requestRow.id);

  if (!discordUserId || !requestId) {
    return null;
  }

  const { data: member } = await supabase
    .from("members")
    .select("id,discord_username,discord_display_name,name")
    .eq("discord_id", discordUserId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("discord_moderation_events")
    .insert({
      discord_user_id: discordUserId,
      discord_username:
        asText(member?.discord_username) ??
        asText(member?.discord_display_name) ??
        asText(requestRow.discord_username),
      event_type: "warn",
      member_id: asText(member?.id) ?? asText(requestRow.member_id),
      metadata: {
        commandStatus: "pending",
        memberFileImageRequestId: requestId,
        policy: "member_file_image_required",
      },
      moderator_name: "Schland Bot",
      reason:
        "Mitgliederaktenbild nicht innerhalb von 48 Stunden nach Aufforderung eingereicht.",
      source: WARNING_SOURCE,
      started_at: new Date().toISOString(),
      status: "recorded",
    })
    .select("id")
    .single();

  if (error) {
    console.error("member image warning queue failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return null;
  }

  return asText(asRecord(data).id);
}

async function writeRequestLog(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    action: string;
    actorDiscordUserId?: string | null;
    details?: Record<string, unknown>;
    discordMessageId?: string | null;
    requestId: string;
  },
) {
  const { error } = await supabase.from("member_file_image_request_logs").insert({
    action: input.action,
    actor_discord_user_id: input.actorDiscordUserId ?? null,
    details: input.details ?? {},
    discord_message_id: input.discordMessageId ?? null,
    request_id: input.requestId,
  });

  if (error) {
    console.error("member image request log failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
  }
}

function mapRequest(row: unknown) {
  const request = asRecord(row);

  return {
    createdAt: asText(request.created_at),
    deadlineAt: asText(request.deadline_at),
    discordUserId: asText(request.discord_user_id),
    discordUsername: asText(request.discord_username),
    fileId: asText(request.file_id),
    guildId: asText(request.guild_id),
    id: asText(request.id),
    joinedAt: asText(request.joined_at),
    lastError: asText(request.last_error),
    memberId: asText(request.member_id),
    messageDueAt: asText(request.message_due_at),
    messageSentAt: asText(request.message_sent_at),
    metadata: asRecord(request.metadata),
    requestMessageId: asText(request.request_message_id),
    status: asText(request.status),
    submittedMessageId: asText(request.submitted_message_id),
    warningEventId: asText(request.warning_event_id),
  };
}

function writeFailed(message: string) {
  console.error("member image request update failed", { message });

  return NextResponse.json(
    { error: "member_image_request_update_failed" },
    { status: 500 },
  );
}
