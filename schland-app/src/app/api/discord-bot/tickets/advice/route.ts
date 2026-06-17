import { NextResponse } from "next/server";

import {
  analyzeModerationAdviceCase,
  writeModerationAdviceLog,
} from "@/lib/moderation-advice";
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

  if (!ticketId || !isUuid(ticketId)) {
    return NextResponse.json({ error: "ticket_id_required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const ticket = await loadTicket(supabase, ticketId);

  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  const participants = Array.isArray(ticket.discord_ticket_participants)
    ? ticket.discord_ticket_participants.map(asRecord)
    : [];
  const targets = participants.filter(
    (participant) =>
      asText(participant.role) === "counterpart" &&
      participant.excluded_from_ticket !== true,
  );

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "ticket_advice_target_required" },
      { status: 400 },
    );
  }

  const actorDiscordUserId = asText(
    body?.actorDiscordUserId ?? body?.actor_discord_user_id,
  );
  const actorName =
    asText(body?.actorDiscordUsername ?? body?.actor_discord_username) ??
    "Discord Ticket Bot";
  const evidenceRows = await loadTicketEvidence(supabase, ticketId);
  const createdCaseIds: string[] = [];

  await supabase
    .from("discord_tickets")
    .update({ status: "advice_running" })
    .eq("id", ticketId);

  for (const target of targets) {
    const targetDiscordUserId = asText(target.discord_user_id);
    const targetDiscordUsername = asText(target.discord_username);
    const member = targetDiscordUserId
      ? await findMemberByDiscordId(supabase, targetDiscordUserId)
      : null;
    const { data: adviceCase, error: caseError } = await supabase
      .from("moderation_advice_cases")
      .insert({
        affected_people: buildAffectedPeople(ticket, participants),
        behavior_summary: buildBehaviorSummary(ticket, target),
        desired_outcome:
          asText(ticket.desired_outcome) ??
          "Auswertung eines Discord-Tickets; Entscheidung durch berechtigte Moderation.",
        incident_at: asText(ticket.incident_at),
        internal_notes: buildInternalNotes(ticket, participants),
        situation_text: asText(ticket.description) ?? "",
        status: "draft",
        submitted_by: null,
        target_discord_user_id: targetDiscordUserId,
        target_discord_username: targetDiscordUsername,
        target_member_id: member?.id ?? null,
        title: `Ticket ${ticket.ticket_number}: ${getTicketTypeLabel(
          asText(ticket.ticket_type),
        )}`,
      })
      .select("id,case_number")
      .single();
    const adviceCaseRecord = asRecord(adviceCase);
    const caseId = asText(adviceCaseRecord.id);

    if (caseError || !caseId) {
      console.error("ticket advice case insert failed", {
        code: caseError?.code,
        details: caseError?.details,
        message: caseError?.message,
      });

      return NextResponse.json(
        { error: "ticket_advice_case_insert_failed" },
        { status: 500 },
      );
    }

    createdCaseIds.push(caseId);
    await copyEvidenceToAdviceCase(supabase, {
      caseId,
      evidenceRows,
      ticket,
    });
    await writeModerationAdviceLog(supabase, {
      action: "beratung_erstellt",
      actorId: null,
      caseId,
      details: {
        actorDiscordUserId,
        actorName,
        source: "discord-ticket",
        ticketId,
        ticketNumber: ticket.ticket_number,
      },
    });
    await analyzeModerationAdviceCase({
      actorId: null,
      actorName,
      caseId,
    });
  }

  const { error: updateError } = await supabase
    .from("discord_tickets")
    .update({
      advice_case_ids: createdCaseIds,
      status: "advice_ready",
    })
    .eq("id", ticketId);

  if (updateError) {
    console.error("ticket advice case id update failed", {
      code: updateError.code,
      details: updateError.details,
      message: updateError.message,
    });
  }

  await supabase.from("discord_ticket_logs").insert({
    action: "ticket_advice_ready",
    actor_discord_user_id: actorDiscordUserId,
    actor_discord_username: actorName,
    details: { adviceCaseIds: createdCaseIds },
    ticket_id: ticketId,
  });

  return NextResponse.json({
    adviceCaseIds: createdCaseIds,
  });
}

async function loadTicket(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  ticketId: string,
) {
  const { data, error } = await supabase
    .from("discord_tickets")
    .select(
      `
        *,
        discord_ticket_participants(*)
      `,
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (error) {
    throw new Error(`ticket advice lookup failed: ${error.message}`);
  }

  return data ? asRecord(data) : null;
}

async function loadTicketEvidence(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  ticketId: string,
) {
  const { data, error } = await supabase
    .from("discord_ticket_evidence")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    throw new Error(`ticket advice evidence lookup failed: ${error.message}`);
  }

  return (data ?? []).map(asRecord);
}

async function findMemberByDiscordId(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  discordUserId: string,
) {
  const { data, error } = await supabase
    .from("members")
    .select("id")
    .eq("discord_id", discordUserId)
    .maybeSingle();

  if (error) {
    console.error("ticket advice member lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
  }

  const memberId = asText(asRecord(data).id);

  return memberId ? { id: memberId } : null;
}

async function copyEvidenceToAdviceCase(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    caseId: string;
    evidenceRows: Record<string, unknown>[];
    ticket: Record<string, unknown>;
  },
) {
  const baseEvidence = [
    {
      advice_case_id: input.caseId,
      description: [
        `Ticket: ${input.ticket.ticket_number}`,
        `Channel: ${input.ticket.channel_id ?? "-"}`,
        `Vorfallzeit: ${input.ticket.incident_time_text ?? input.ticket.incident_at ?? "-"}`,
        `Vorfallchannel: ${input.ticket.incident_channel_name ?? input.ticket.incident_channel_id ?? "-"}`,
      ].join("\n"),
      evidence_type: "note",
      label: "Ticket-Kontext",
      metadata: {
        source: "discord-ticket",
        ticketId: input.ticket.id,
        ticketNumber: input.ticket.ticket_number,
      },
    },
  ];
  const copiedEvidence = input.evidenceRows.map((evidence) => ({
    advice_case_id: input.caseId,
    description: buildEvidenceDescription(evidence),
    evidence_type: mapAdviceEvidenceType(evidence),
    external_url: asText(evidence.external_url),
    label:
      asText(evidence.attachment_filename) ??
      asText(evidence.discord_message_id) ??
      "Ticket-Beleg",
    metadata: {
      attachmentContentType: asText(evidence.attachment_content_type),
      attachmentFilename: asText(evidence.attachment_filename),
      attachmentSize: evidence.attachment_size,
      discordMessageId: asText(evidence.discord_message_id),
      source: "discord-ticket",
      ticketEvidenceId: asText(evidence.id),
      ticketId: input.ticket.id,
      ...(asRecord(evidence.metadata) ?? {}),
    },
  }));

  const { error } = await supabase
    .from("moderation_advice_evidence")
    .insert([...baseEvidence, ...copiedEvidence]);

  if (error) {
    throw new Error(`ticket advice evidence copy failed: ${error.message}`);
  }
}

function buildAffectedPeople(
  ticket: Record<string, unknown>,
  participants: Record<string, unknown>[],
) {
  const lines = [
    `Ersteller: ${ticket.creator_discord_username ?? ticket.creator_discord_user_id}`,
  ];

  for (const participant of participants) {
    if (asText(participant.role) === "counterpart") {
      lines.push(
        `Gegenpartei: ${
          asText(participant.discord_username) ?? asText(participant.discord_user_id)
        }`,
      );
    }

    if (participant.excluded_from_ticket === true) {
      lines.push(
        `Vom Ticket ausgeschlossen: ${
          asText(participant.discord_username) ?? asText(participant.discord_user_id)
        }`,
      );
    }
  }

  return lines.join("\n");
}

function buildBehaviorSummary(
  ticket: Record<string, unknown>,
  target: Record<string, unknown>,
) {
  return [
    `Ticketart: ${getTicketTypeLabel(asText(ticket.ticket_type))}`,
    `Zielperson: ${asText(target.discord_username) ?? asText(target.discord_user_id)}`,
    `Incident-Channel: ${ticket.incident_channel_name ?? ticket.incident_channel_id ?? "-"}`,
    `Zeitpunkt: ${ticket.incident_time_text ?? ticket.incident_at ?? "-"}`,
    "Quelle: Discord-Ticket-System.",
  ].join("\n");
}

function buildInternalNotes(
  ticket: Record<string, unknown>,
  participants: Record<string, unknown>[],
) {
  return [
    `Ticket-ID: ${ticket.id}`,
    `Ticketnummer: ${ticket.ticket_number}`,
    `Ticket-Channel-ID: ${ticket.channel_id ?? "-"}`,
    `Ausgeschlossene Personen: ${participants
      .filter((participant) => participant.excluded_from_ticket === true)
      .map(
        (participant) =>
          asText(participant.discord_username) ?? asText(participant.discord_user_id),
      )
      .join(", ") || "-"}`,
    "Hinweis: Der Sanktionsberater gibt nur eine Empfehlung. Ausfuehrung bleibt ein bewusster Admin-Klick.",
  ].join("\n");
}

function buildEvidenceDescription(evidence: Record<string, unknown>) {
  return [
    asText(evidence.content),
    asText(evidence.external_url),
    asText(evidence.attachment_filename)
      ? `Attachment: ${asText(evidence.attachment_filename)} (${asText(
          evidence.attachment_content_type,
        ) ?? "unbekannt"})`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3500);
}

function mapAdviceEvidenceType(evidence: Record<string, unknown>) {
  const evidenceType = asText(evidence.evidence_type);
  const contentType = asText(evidence.attachment_content_type)?.toLowerCase();

  if (evidenceType === "message_link") {
    return "message_link";
  }

  if (contentType?.startsWith("image/") || evidenceType === "screenshot") {
    return "screenshot";
  }

  if (evidenceType === "file" || evidenceType === "attachment") {
    return "file";
  }

  return "note";
}

function getTicketTypeLabel(value: string | null) {
  const labels: Record<string, string> = {
    government_member_dispute: "Streit mit Regierungsmitglied",
    government_request: "Anfrage an die Regierung",
    member_dispute: "Streit mit Mitglied",
  };

  return value ? labels[value] ?? value : "Discord-Ticket";
}
