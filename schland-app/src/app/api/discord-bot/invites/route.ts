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

const INVITE_STATUSES = new Set([
  "cancelled",
  "created",
  "expired",
  "failed",
  "used",
]);
const DM_STATUSES = new Set(["failed", "pending", "sent", "skipped"]);

export async function GET(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  await supabase
    .from("discord_invite_requests")
    .update({ status: "expired" })
    .in("status", ["pending", "created"])
    .lte("expires_at", now);

  const cleanupCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("discord_invite_requests")
    .delete()
    .in("status", ["cancelled", "expired", "failed", "used"])
    .lte("created_at", cleanupCutoff);

  const { data, error } = await supabase
    .from("discord_invite_requests")
    .select(
      `
        id,
        invitee_name,
        invitee_discord_id,
        reason,
        requested_by_name,
        max_uses,
        uses,
        expires_at,
        created_at,
        dm_status,
        dm_error,
        dm_sent_at,
        status,
        discord_invite_code,
        discord_invite_url,
        target_member:members!discord_invite_requests_target_member_id_fkey(id,name,discord_id,discord_username,discord_display_name),
        requested_permission:permissions!discord_invite_requests_requested_permission_id_fkey(id,permission_key,description)
      `,
    )
    .in("status", ["pending", "cancelled"])
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error("discord bot invite lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "invite_lookup_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    invites: (data ?? []).map(mapInviteRequest),
  });
}

export async function PATCH(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const id = asText(body?.id);
  const status = asText(body?.status);

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "invite_id_required" }, { status: 400 });
  }

  if (!status || !INVITE_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "invite_status_invalid" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    status,
  };

  if (status === "created") {
    const code = asText(body?.discordInviteCode ?? body?.inviteCode);
    const url = asText(body?.discordInviteUrl ?? body?.inviteUrl);

    if (!code || !url) {
      return NextResponse.json(
        { error: "invite_code_and_url_required" },
        { status: 400 },
      );
    }

    update.discord_invite_code = code;
    update.discord_invite_url = url;
    update.bot_error = null;
    update.uses = 0;
  }

  if (status === "failed") {
    update.bot_error = asText(body?.botError) ?? "Discord invite creation failed";
  }

  if (status === "cancelled") {
    update.bot_error = asText(body?.botError);
  }

  const dmStatus = asText(body?.dmStatus ?? body?.dm_status);

  if (dmStatus && DM_STATUSES.has(dmStatus)) {
    update.dm_status = dmStatus;
    update.dm_error = asText(body?.dmError ?? body?.dm_error);
    update.dm_sent_at = dmStatus === "sent" ? new Date().toISOString() : null;
  }

  if (status === "used") {
    update.uses = 1;
  } else if (body && "uses" in body) {
    update.uses = Math.min(Math.max(asInteger(body.uses) ?? 0, 0), 1);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("discord_invite_requests")
    .update(update)
    .eq("id", id)
    .select(
      `
        id,
        invitee_name,
        invitee_discord_id,
        reason,
        requested_by_name,
        status,
        max_uses,
        uses,
        expires_at,
        created_at,
        discord_invite_code,
        discord_invite_url,
        dm_status,
        dm_error,
        dm_sent_at,
        bot_error,
        target_member:members!discord_invite_requests_target_member_id_fkey(id,name,discord_id,discord_username,discord_display_name),
        requested_permission:permissions!discord_invite_requests_requested_permission_id_fkey(id,permission_key,description)
      `,
    )
    .single();

  if (error) {
    console.error("discord bot invite update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "invite_update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    invite: mapInviteRequest(data),
  });
}

function mapInviteRequest(row: unknown) {
  const invite = asRecord(row);
  const targetMember = asRecord(invite.target_member);
  const permission = asRecord(invite.requested_permission);

  return {
    createdAt: String(invite.created_at ?? ""),
    discordInviteCode: String(invite.discord_invite_code ?? ""),
    discordInviteUrl: String(invite.discord_invite_url ?? ""),
    expiresAt: String(invite.expires_at ?? ""),
    id: String(invite.id ?? ""),
    inviteeDiscordId: String(invite.invitee_discord_id ?? ""),
    inviteeName: String(invite.invitee_name ?? ""),
    maxUses: Number(invite.max_uses ?? 1),
    dmError: String(invite.dm_error ?? ""),
    dmSentAt: String(invite.dm_sent_at ?? ""),
    dmStatus: String(invite.dm_status ?? "pending"),
    permission: {
      description: String(permission.description ?? ""),
      id: String(permission.id ?? ""),
      key: String(permission.permission_key ?? ""),
    },
    reason: String(invite.reason ?? ""),
    requestedByName: String(invite.requested_by_name ?? ""),
    status: String(invite.status ?? "pending"),
    targetMember: {
      discordDisplayName: String(targetMember.discord_display_name ?? ""),
      discordId: String(targetMember.discord_id ?? ""),
      discordUsername: String(targetMember.discord_username ?? ""),
      id: String(targetMember.id ?? ""),
      name: String(targetMember.name ?? ""),
    },
    uses: Number(invite.uses ?? 0),
  };
}
