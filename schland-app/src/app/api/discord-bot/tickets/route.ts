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

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

const TICKET_TYPES = new Set([
  "government_request",
  "member_dispute",
  "government_member_dispute",
]);
const TICKET_STATUSES = new Set([
  "open",
  "advice_running",
  "advice_ready",
  "closed",
  "cancelled",
]);
const OPEN_TICKET_STATUSES = ["open", "advice_running", "advice_ready"];
const MAX_OPEN_TICKETS_PER_USER = 3;

export async function GET(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const { searchParams } = new URL(request.url);
  const channelId = asText(searchParams.get("channelId"));
  const ticketId = asText(searchParams.get("ticketId"));
  const creatorDiscordUserId = asText(searchParams.get("creatorDiscordUserId"));
  const status = asText(searchParams.get("status"));
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from("discord_tickets")
    .select(getTicketSelect())
    .order("created_at", { ascending: false })
    .limit(20);

  if (ticketId) {
    if (!isUuid(ticketId)) {
      return NextResponse.json({ error: "ticket_id_invalid" }, { status: 400 });
    }

    query = query.eq("id", ticketId).limit(1);
  }

  if (channelId) {
    query = query.eq("channel_id", channelId).limit(1);
  }

  if (creatorDiscordUserId) {
    query = query.eq("creator_discord_user_id", creatorDiscordUserId);
  }

  if (status) {
    if (!TICKET_STATUSES.has(status)) {
      return NextResponse.json({ error: "ticket_status_invalid" }, { status: 400 });
    }

    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("discord ticket lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "ticket_lookup_failed" },
      { status: 500 },
    );
  }

  const tickets = (data ?? []).map(mapTicket);

  if (ticketId || channelId) {
    return NextResponse.json({ ticket: tickets[0] ?? null });
  }

  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const guildId = asText(body?.guildId ?? body?.guild_id);
  const creatorDiscordUserId = asText(
    body?.creatorDiscordUserId ?? body?.creator_discord_user_id,
  );
  const ticketType = asText(body?.ticketType ?? body?.ticket_type);

  if (!guildId || !creatorDiscordUserId) {
    return NextResponse.json(
      { error: "ticket_identity_required" },
      { status: 400 },
    );
  }

  if (!ticketType || !TICKET_TYPES.has(ticketType)) {
    return NextResponse.json({ error: "ticket_type_invalid" }, { status: 400 });
  }

  const counterpartUsers = normalizeTicketUsers(body?.counterpartUsers);
  const excludedUsers = normalizeTicketUsers(body?.excludedUsers);

  if (counterpartUsers.length < 1) {
    return NextResponse.json(
      { error: "ticket_counterpart_required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from("discord_tickets")
    .select("id", { count: "exact", head: true })
    .eq("creator_discord_user_id", creatorDiscordUserId)
    .in("status", OPEN_TICKET_STATUSES);

  if (countError) {
    console.error("discord ticket open count failed", {
      code: countError.code,
      details: countError.details,
      message: countError.message,
    });

    return NextResponse.json(
      { error: "ticket_open_count_failed" },
      { status: 500 },
    );
  }

  if ((count ?? 0) >= MAX_OPEN_TICKETS_PER_USER) {
    return NextResponse.json(
      { error: "ticket_open_limit_reached" },
      { status: 429 },
    );
  }

  const { data, error } = await supabase
    .from("discord_tickets")
    .insert({
      channel_id: asText(body?.channelId ?? body?.channel_id),
      channel_name: asText(body?.channelName ?? body?.channel_name),
      creator_discord_user_id: creatorDiscordUserId,
      creator_discord_username: asText(
        body?.creatorDiscordUsername ?? body?.creator_discord_username,
      ),
      description: asText(body?.description) ?? "",
      desired_outcome: asText(body?.desiredOutcome ?? body?.desired_outcome) ?? "",
      guild_id: guildId,
      incident_at: asIsoDate(body?.incidentAt ?? body?.incident_at),
      incident_channel_id: asText(
        body?.incidentChannelId ?? body?.incident_channel_id,
      ),
      incident_channel_name: asText(
        body?.incidentChannelName ?? body?.incident_channel_name,
      ),
      incident_time_text: asText(
        body?.incidentTimeText ?? body?.incident_time_text,
      ),
      metadata: asRecord(body?.metadata),
      ticket_type: ticketType,
    })
    .select(getTicketSelect())
    .single();
  const insertedTicketId = asText(asRecord(data).id);

  if (error || !insertedTicketId) {
    console.error("discord ticket insert failed", {
      code: error?.code,
      details: error?.details,
      message: error?.message,
    });

    return NextResponse.json(
      { error: "ticket_insert_failed" },
      { status: 500 },
    );
  }

  await upsertTicketParticipants(supabase, {
    counterpartUsers,
    creator: {
      discordUserId: creatorDiscordUserId,
      discordUsername: asText(
        body?.creatorDiscordUsername ?? body?.creator_discord_username,
      ),
    },
    excludedUsers,
    ticketId: insertedTicketId,
  });

  await writeTicketLog(supabase, {
    action: "ticket_created",
    actorDiscordUserId: creatorDiscordUserId,
    actorDiscordUsername: asText(
      body?.creatorDiscordUsername ?? body?.creator_discord_username,
    ),
    details: {
      counterpartUsers,
      excludedUsers,
      ticketType,
    },
    ticketId: insertedTicketId,
  });

  const ticket = await getTicketById(supabase, insertedTicketId);

  return NextResponse.json({ ticket });
}

export async function PATCH(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const action = asText(body?.action) ?? "update";
  const supabase = getSupabaseAdminClient();
  const ticket = await findTicketForMutation(supabase, body);

  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  const ticketId = asText(ticket.id);

  if (!ticketId) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  if (action === "add_participant") {
    const user = normalizeTicketUser(body?.user);

    if (!user) {
      return NextResponse.json(
        { error: "ticket_participant_required" },
        { status: 400 },
      );
    }

    const participants = getParticipants(ticket);
    const blocked = participants.some(
      (participant) =>
        participant.discordUserId === user.discordUserId &&
        participant.excludedFromTicket,
    );

    if (blocked) {
      await writeTicketLog(supabase, {
        action: "ticket_add_blocked_excluded_user",
        actorDiscordUserId: asText(body?.actorDiscordUserId),
        actorDiscordUsername: asText(body?.actorDiscordUsername),
        details: { target: user },
        ticketId,
      });

      return NextResponse.json(
        { error: "ticket_user_explicitly_excluded" },
        { status: 409 },
      );
    }

    const { error } = await supabase.from("discord_ticket_participants").upsert(
      {
        added_by_discord_user_id: asText(body?.actorDiscordUserId),
        added_reason: asText(body?.reason),
        discord_user_id: user.discordUserId,
        discord_username: user.discordUsername,
        excluded_from_ticket: false,
        role: "added",
        ticket_id: ticketId,
      },
      { onConflict: "ticket_id,discord_user_id,role" },
    );

    if (error) {
      console.error("discord ticket participant add failed", {
        code: error.code,
        details: error.details,
        message: error.message,
      });

      return NextResponse.json(
        { error: "ticket_participant_add_failed" },
        { status: 500 },
      );
    }

    await writeTicketLog(supabase, {
      action: "ticket_participant_added",
      actorDiscordUserId: asText(body?.actorDiscordUserId),
      actorDiscordUsername: asText(body?.actorDiscordUsername),
      details: { reason: asText(body?.reason), target: user },
      ticketId,
    });

    return NextResponse.json({ ticket: await getTicketById(supabase, ticketId) });
  }

  const patch: Record<string, unknown> = {};
  const requestedStatus = asText(body?.status);

  if (asText(body?.channelId ?? body?.channel_id)) {
    patch.channel_id = asText(body?.channelId ?? body?.channel_id);
  }

  if (asText(body?.channelName ?? body?.channel_name)) {
    patch.channel_name = asText(body?.channelName ?? body?.channel_name);
  }

  if (requestedStatus && TICKET_STATUSES.has(requestedStatus)) {
    patch.status = requestedStatus;
  }

  if (action === "close") {
    patch.closed_at = new Date().toISOString();
    patch.closed_by_discord_user_id = asText(body?.actorDiscordUserId);
    patch.close_reason = asText(body?.reason);
    patch.status = "closed";
  }

  if (Array.isArray(body?.adviceCaseIds ?? body?.advice_case_ids)) {
    patch.advice_case_ids = (body?.adviceCaseIds ?? body?.advice_case_ids) as unknown[];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ticket: mapTicket(ticket) });
  }

  const { error } = await supabase
    .from("discord_tickets")
    .update(patch)
    .eq("id", ticketId);

  if (error) {
    console.error("discord ticket update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "ticket_update_failed" },
      { status: 500 },
    );
  }

  await writeTicketLog(supabase, {
    action: action === "close" ? "ticket_closed" : "ticket_updated",
    actorDiscordUserId: asText(body?.actorDiscordUserId),
    actorDiscordUsername: asText(body?.actorDiscordUsername),
    details: patch,
    ticketId,
  });

  return NextResponse.json({ ticket: await getTicketById(supabase, ticketId) });
}

export function getTicketSelect() {
  return `
    id,
    ticket_number,
    guild_id,
    channel_id,
    channel_name,
    creator_discord_user_id,
    creator_discord_username,
    ticket_type,
    status,
    incident_at,
    incident_time_text,
    incident_channel_id,
    incident_channel_name,
    description,
    desired_outcome,
    metadata,
    advice_case_ids,
    closed_at,
    close_reason,
    closed_by_discord_user_id,
    created_at,
    updated_at,
    discord_ticket_participants(
      id,
      discord_user_id,
      discord_username,
      role,
      excluded_from_ticket,
      added_by_discord_user_id,
      added_reason,
      created_at
    )
  `;
}

export async function getTicketById(
  supabase: SupabaseAdminClient,
  ticketId: string,
) {
  const { data, error } = await supabase
    .from("discord_tickets")
    .select(getTicketSelect())
    .eq("id", ticketId)
    .maybeSingle();

  if (error) {
    throw new Error(`ticket lookup failed: ${error.message}`);
  }

  return data ? mapTicket(data) : null;
}

export async function writeTicketLog(
  supabase: SupabaseAdminClient,
  input: {
    action: string;
    actorDiscordUserId?: string | null;
    actorDiscordUsername?: string | null;
    details?: Record<string, unknown>;
    ticketId?: string | null;
  },
) {
  const { error } = await supabase.from("discord_ticket_logs").insert({
    action: input.action,
    actor_discord_user_id: input.actorDiscordUserId ?? null,
    actor_discord_username: input.actorDiscordUsername ?? null,
    details: input.details ?? {},
    ticket_id: input.ticketId ?? null,
  });

  if (error) {
    console.error("discord ticket log failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
  }
}

function mapTicket(row: unknown) {
  const ticket = asRecord(row);

  return {
    adviceCaseIds: Array.isArray(ticket.advice_case_ids)
      ? ticket.advice_case_ids
      : [],
    channelId: asText(ticket.channel_id),
    channelName: asText(ticket.channel_name),
    closedAt: asText(ticket.closed_at),
    closeReason: asText(ticket.close_reason),
    closedByDiscordUserId: asText(ticket.closed_by_discord_user_id),
    createdAt: asText(ticket.created_at),
    creatorDiscordUserId: asText(ticket.creator_discord_user_id),
    creatorDiscordUsername: asText(ticket.creator_discord_username),
    description: asText(ticket.description) ?? "",
    desiredOutcome: asText(ticket.desired_outcome) ?? "",
    guildId: asText(ticket.guild_id),
    id: asText(ticket.id),
    incidentAt: asText(ticket.incident_at),
    incidentChannelId: asText(ticket.incident_channel_id),
    incidentChannelName: asText(ticket.incident_channel_name),
    incidentTimeText: asText(ticket.incident_time_text),
    metadata: asRecord(ticket.metadata),
    participants: getParticipants(ticket),
    status: asText(ticket.status),
    ticketNumber: asText(ticket.ticket_number),
    ticketType: asText(ticket.ticket_type),
    updatedAt: asText(ticket.updated_at),
  };
}

function getParticipants(ticket: Record<string, unknown>) {
  const participants = Array.isArray(ticket.discord_ticket_participants)
    ? ticket.discord_ticket_participants
    : [];

  return participants.map((item) => {
    const participant = asRecord(item);

    return {
      addedByDiscordUserId: asText(participant.added_by_discord_user_id),
      addedReason: asText(participant.added_reason),
      createdAt: asText(participant.created_at),
      discordUserId: asText(participant.discord_user_id),
      discordUsername: asText(participant.discord_username),
      excludedFromTicket: participant.excluded_from_ticket === true,
      id: asText(participant.id),
      role: asText(participant.role),
    };
  });
}

async function findTicketForMutation(
  supabase: SupabaseAdminClient,
  body: Record<string, unknown> | null,
) {
  const ticketId = asText(body?.ticketId ?? body?.ticket_id);
  const channelId = asText(body?.channelId ?? body?.channel_id);

  if (ticketId && !isUuid(ticketId)) {
    return null;
  }

  let query = supabase.from("discord_tickets").select(getTicketSelect()).limit(1);

  if (ticketId) {
    query = query.eq("id", ticketId);
  } else if (channelId) {
    query = query.eq("channel_id", channelId);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`ticket mutation lookup failed: ${error.message}`);
  }

  return data ? asRecord(data) : null;
}

async function upsertTicketParticipants(
  supabase: SupabaseAdminClient,
  input: {
    counterpartUsers: TicketUser[];
    creator: TicketUser;
    excludedUsers: TicketUser[];
    ticketId: string;
  },
) {
  const rows = [
    {
      discord_user_id: input.creator.discordUserId,
      discord_username: input.creator.discordUsername,
      excluded_from_ticket: false,
      role: "creator",
      ticket_id: input.ticketId,
    },
    ...input.counterpartUsers.map((user) => ({
      discord_user_id: user.discordUserId,
      discord_username: user.discordUsername,
      excluded_from_ticket: false,
      role: "counterpart",
      ticket_id: input.ticketId,
    })),
    ...input.excludedUsers.map((user) => ({
      discord_user_id: user.discordUserId,
      discord_username: user.discordUsername,
      excluded_from_ticket: true,
      role: "excluded",
      ticket_id: input.ticketId,
    })),
  ];

  const { error } = await supabase
    .from("discord_ticket_participants")
    .upsert(rows, { onConflict: "ticket_id,discord_user_id,role" });

  if (error) {
    throw new Error(`ticket participant write failed: ${error.message}`);
  }
}

type TicketUser = {
  discordUserId: string;
  discordUsername: string | null;
};

function normalizeTicketUsers(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Map(
          value
            .map(normalizeTicketUser)
            .filter((item): item is TicketUser => Boolean(item))
            .map((item) => [item.discordUserId, item]),
        ).values(),
      )
    : [];
}

function normalizeTicketUser(value: unknown): TicketUser | null {
  const user = asRecord(value);
  const discordUserId = asText(
    user.discordUserId ?? user.discord_user_id ?? user.id,
  );

  if (!discordUserId) {
    return null;
  }

  return {
    discordUserId,
    discordUsername: asText(
      user.discordUsername ?? user.discord_username ?? user.username,
    ),
  };
}
