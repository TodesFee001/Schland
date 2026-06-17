import { NextResponse } from "next/server";

import {
  asInteger,
  asRecord,
  asText,
  getDiscordBotAuthError,
  isUuid,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EVIDENCE_TYPES = new Set([
  "message",
  "message_link",
  "attachment",
  "screenshot",
  "file",
  "transcript",
  "note",
  "other",
]);

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const supabase = getSupabaseAdminClient();
  const ticketId = await resolveTicketId(supabase, body);

  if (!ticketId) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [body];
  const rows = rawItems.map((item) => normalizeEvidenceItem(item, ticketId));

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "ticket_evidence_required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("discord_ticket_evidence")
    .insert(rows)
    .select("id,evidence_type,created_at");

  if (error) {
    console.error("discord ticket evidence write failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "ticket_evidence_write_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    evidence: (data ?? []).map((item) => {
      const evidence = asRecord(item);

      return {
        createdAt: asText(evidence.created_at),
        evidenceType: asText(evidence.evidence_type),
        id: asText(evidence.id),
      };
    }),
  });
}

async function resolveTicketId(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  body: Record<string, unknown> | null,
) {
  const ticketId = asText(body?.ticketId ?? body?.ticket_id);

  if (ticketId) {
    return isUuid(ticketId) ? ticketId : null;
  }

  const channelId = asText(body?.channelId ?? body?.channel_id);

  if (!channelId) {
    return null;
  }

  const { data, error } = await supabase
    .from("discord_tickets")
    .select("id,status")
    .eq("channel_id", channelId)
    .in("status", ["open", "advice_running", "advice_ready"])
    .maybeSingle();

  if (error) {
    throw new Error(`ticket evidence lookup failed: ${error.message}`);
  }

  return asText(asRecord(data).id);
}

function normalizeEvidenceItem(value: unknown, ticketId: string) {
  const item = asRecord(value);
  const requestedType = asText(item.evidenceType ?? item.evidence_type);
  const evidenceType =
    requestedType && EVIDENCE_TYPES.has(requestedType)
      ? requestedType
      : inferEvidenceType(item);

  return {
    attachment_content_type: asText(
      item.attachmentContentType ?? item.attachment_content_type ?? item.contentType,
    ),
    attachment_filename: asText(
      item.attachmentFilename ?? item.attachment_filename ?? item.filename,
    ),
    attachment_size: asInteger(
      item.attachmentSize ?? item.attachment_size ?? item.size,
    ),
    author_discord_user_id: asText(
      item.authorDiscordUserId ?? item.author_discord_user_id,
    ),
    author_discord_username: asText(
      item.authorDiscordUsername ?? item.author_discord_username,
    ),
    content: asText(item.content),
    discord_message_id: asText(item.discordMessageId ?? item.discord_message_id),
    evidence_type: evidenceType,
    external_url: asText(item.externalUrl ?? item.external_url ?? item.url),
    metadata: asRecord(item.metadata),
    ticket_id: ticketId,
  };
}

function inferEvidenceType(item: Record<string, unknown>) {
  const contentType = asText(
    item.attachmentContentType ?? item.attachment_content_type ?? item.contentType,
  )?.toLowerCase();

  if (contentType?.startsWith("image/")) {
    return "screenshot";
  }

  if (contentType) {
    return "file";
  }

  if (asText(item.externalUrl ?? item.external_url ?? item.url)) {
    return "message_link";
  }

  return "message";
}
