import { asIsoDate, asRecord, asText } from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_AUDIT_LOG_SOURCE = "discord-audit-log";
const INVITE_MAX_AGE_SECONDS = 24 * 60 * 60;
const INVITE_BATCH_LIMIT = 10;
const AUDIT_LOG_BATCH_LIMIT = 100;
const MEMBER_PAGE_LIMIT = 1000;
const MEMBER_MAX_PAGES = 100;
const DISCORD_EPOCH = BigInt("1420070400000");

const AUDIT_LOG_ACTIONS = {
  AUTO_MODERATION_USER_COMMUNICATION_DISABLED: 145,
  MEMBER_BAN_ADD: 22,
  MEMBER_BAN_REMOVE: 23,
  MEMBER_DISCONNECT: 27,
  MEMBER_KICK: 20,
  MEMBER_UPDATE: 24,
} as const;

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

type DiscordSyncStatus = "failed" | "partial" | "skipped" | "success";

type DiscordSyncConfig = {
  botToken: string;
  guildId: string;
  inviteChannelId: string;
  missing: string[];
};

type DiscordInvite = {
  code?: string;
};

type DiscordUser = {
  bot?: boolean | null;
  discriminator?: string | null;
  global_name?: string | null;
  id?: string | null;
  username?: string | null;
};

type DiscordGuildMember = {
  joined_at?: string | null;
  nick?: string | null;
  roles?: string[] | null;
  user?: DiscordUser | null;
};

type DiscordGuildRole = {
  id?: string | null;
  name?: string | null;
};

type DiscordGuildSummary = {
  approximate_member_count?: number | null;
  approximate_presence_count?: number | null;
  name?: string | null;
};

type DiscordDmChannel = {
  id?: string | null;
};

type DiscordAuditLogChange = {
  key?: string | null;
  new_value?: unknown;
  old_value?: unknown;
};

type DiscordAuditLogEntry = {
  action_type?: number | null;
  changes?: DiscordAuditLogChange[] | null;
  id?: string | null;
  options?: Record<string, unknown> | null;
  reason?: string | null;
  target_id?: string | null;
  user_id?: string | null;
};

type DiscordAuditLogResponse = {
  audit_log_entries?: DiscordAuditLogEntry[];
  users?: DiscordUser[];
};

type DiscordUserInfo = {
  isBot: boolean;
  name: string;
};

type InviteSyncSummary = {
  created: number;
  dmFailed: number;
  dmSent: number;
  dmSkipped: number;
  expired: number;
  failed: number;
  purged: number;
  scanned: number;
};

type InviteSyncOptions = {
  expireOld?: boolean;
  ids?: string[];
  limit?: number;
};

type ModerationSyncSummary = {
  failed: number;
  lastAuditLogId: string | null;
  recorded: number;
  scanned: number;
  skipped: number;
};

type MemberSyncSummary = {
  coverageComplete: boolean;
  failed: number;
  guildMemberEstimate: number | null;
  guildName: string | null;
  guildPresenceEstimate: number | null;
  missingEstimate: number | null;
  pageLimitHit: boolean;
  rolesSynced: number;
  scanned: number;
  skippedBots: number;
  upserted: number;
};

type ModerationEventPayload = {
  channelId: string | null;
  channelName: string | null;
  discordUserId: string;
  discordUsername: string | null;
  durationSeconds: number | null;
  endedAt: string | null;
  eventType: "ban" | "kick" | "timeout" | "voice_disconnect";
  externalEventId: string;
  metadata: Record<string, unknown>;
  moderatorDiscordId: string | null;
  moderatorName: string | null;
  reason: string | null;
  startedAt: string;
  status: "active" | "expired" | "failed" | "lifted" | "recorded";
};

export type DiscordSyncSummary = {
  invites: InviteSyncSummary;
  members: MemberSyncSummary;
  missingConfig: string[];
  moderation: ModerationSyncSummary;
  status: DiscordSyncStatus;
  syncRunId: string | null;
};

export async function runDiscordSync(trigger = "cron"): Promise<DiscordSyncSummary> {
  const supabase = getSupabaseAdminClient();
  const syncRunId = await startSyncRun(supabase, trigger);
  const config = getDiscordSyncConfig();
  const summary: DiscordSyncSummary = {
    invites: {
      created: 0,
      dmFailed: 0,
      dmSent: 0,
      dmSkipped: 0,
      expired: 0,
      failed: 0,
      purged: 0,
      scanned: 0,
    },
    members: {
      coverageComplete: false,
      failed: 0,
      guildMemberEstimate: null,
      guildName: null,
      guildPresenceEstimate: null,
      missingEstimate: null,
      pageLimitHit: false,
      rolesSynced: 0,
      scanned: 0,
      skippedBots: 0,
      upserted: 0,
    },
    missingConfig: config.missing,
    moderation: {
      failed: 0,
      lastAuditLogId: null,
      recorded: 0,
      scanned: 0,
      skipped: 0,
    },
    status: "success",
    syncRunId,
  };

  if (config.missing.length > 0) {
    summary.status = "skipped";
    await finishSyncRun(supabase, syncRunId, summary, null);
    return summary;
  }

  try {
    try {
      summary.members = await syncDiscordMembers(supabase, config);
    } catch (memberSyncError) {
      summary.members.failed += 1;
      console.error("discord member sync failed", {
        message: getErrorMessage(memberSyncError),
      });
    }

    summary.invites = await syncInviteRequests(supabase, config);
    summary.moderation = await syncModerationAuditLogs(
      supabase,
      config,
      syncRunId,
    );
    summary.status =
      summary.invites.failed > 0 ||
      summary.invites.dmFailed > 0 ||
      summary.members.failed > 0 ||
      summary.moderation.failed > 0
        ? "partial"
        : "success";

    await finishSyncRun(supabase, syncRunId, summary, null);
    return summary;
  } catch (error) {
    summary.status = "failed";
    await finishSyncRun(supabase, syncRunId, summary, getErrorMessage(error));
    throw error;
  }
}

export async function createPendingDiscordInvites(
  options: InviteSyncOptions = {},
) {
  const supabase = getSupabaseAdminClient();
  const config = getDiscordSyncConfig();

  if (config.missing.length > 0) {
    throw new Error(
      `Discord invite sync missing config: ${config.missing.join(", ")}`,
    );
  }

  return syncInviteRequests(supabase, config, options);
}

export async function deleteDiscordInviteRequest(inviteId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("discord_invite_requests")
    .select("id")
    .eq("id", inviteId)
    .maybeSingle();

  if (error) {
    throw new Error(`Invite lookup failed: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Invite not found.");
  }

  const { error: updateError } = await supabase
    .from("discord_invite_requests")
    .update({
      bot_error: null,
      status: "cancelled",
    })
    .eq("id", inviteId);

  if (updateError) {
    throw new Error(`Invite cancel failed: ${updateError.message}`);
  }
}

function getDiscordSyncConfig(): DiscordSyncConfig {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim() ?? "";
  const guildId = process.env.DISCORD_GUILD_ID?.trim() ?? "";
  const inviteChannelId = process.env.DISCORD_INVITE_CHANNEL_ID?.trim() ?? "";
  const missing = [
    ["DISCORD_BOT_TOKEN", botToken],
    ["DISCORD_GUILD_ID", guildId],
    ["DISCORD_INVITE_CHANNEL_ID", inviteChannelId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return { botToken, guildId, inviteChannelId, missing };
}

async function startSyncRun(supabase: SupabaseAdminClient, trigger: string) {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      metadata: {
        implementation: "vercel-cron-discord-rest",
        trigger,
      },
      source: "discord",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Sync run could not be started: ${error.message}`);
  }

  return String(data.id);
}

async function finishSyncRun(
  supabase: SupabaseAdminClient,
  syncRunId: string,
  summary: DiscordSyncSummary,
  errorMessage: string | null,
) {
  const { error } = await supabase
    .from("sync_runs")
    .update({
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
      metadata: {
        implementation: "vercel-cron-discord-rest",
        invites: summary.invites,
        lastAuditLogId: summary.moderation.lastAuditLogId,
        members: summary.members,
        missingConfig: summary.missingConfig,
        moderation: summary.moderation,
      },
      status: summary.status,
    })
    .eq("id", syncRunId);

  if (error) {
    console.error("discord sync run update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
  }
}

async function syncInviteRequests(
  supabase: SupabaseAdminClient,
  config: DiscordSyncConfig,
  options: InviteSyncOptions = {},
): Promise<InviteSyncSummary> {
  const now = new Date().toISOString();
  const summary: InviteSyncSummary = {
    created: 0,
    dmFailed: 0,
    dmSent: 0,
    dmSkipped: 0,
    expired: 0,
    failed: 0,
    purged: 0,
    scanned: 0,
  };

  if (options.expireOld !== false) {
    const { data: expiredRows, error: expireError } = await supabase
      .from("discord_invite_requests")
      .update({ status: "expired" })
      .in("status", ["pending", "created"])
      .lte("expires_at", now)
      .select("id");

    if (expireError) {
      throw new Error(`Expired invite cleanup failed: ${expireError.message}`);
    }

    summary.expired = Array.isArray(expiredRows) ? expiredRows.length : 0;
  }

  const cleanupCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: purgedRows, error: purgeError } = await supabase
    .from("discord_invite_requests")
    .delete()
    .in("status", ["cancelled", "expired", "failed", "used"])
    .lte("created_at", cleanupCutoff)
    .select("id");

  if (purgeError) {
    throw new Error(`Invite cleanup failed: ${purgeError.message}`);
  }

  summary.purged = Array.isArray(purgedRows) ? purgedRows.length : 0;

  let query = supabase
    .from("discord_invite_requests")
    .select(
      "id,invitee_name,invitee_discord_id,reason,requested_by_name,expires_at,created_at",
    )
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: true });

  if (options.ids?.length) {
    query = query.in("id", options.ids);
  }

  const { data, error } = await query.limit(options.limit ?? INVITE_BATCH_LIMIT);

  if (error) {
    throw new Error(`Invite lookup failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  summary.scanned = rows.length;

  for (const row of rows) {
    const invite = asRecord(row);
    const id = asText(invite.id);

    if (!id) {
      summary.failed += 1;
      continue;
    }

    try {
      const discordInvite = await createDiscordInvite(config, {
        id,
        inviteeName: asText(invite.invitee_name),
        reason: asText(invite.reason),
        requestedByName: asText(invite.requested_by_name),
      });
      const code = asText(discordInvite.code);

      if (!code) {
        throw new Error("Discord returned no invite code.");
      }

      const inviteUrl = `https://discord.gg/${code}`;
      const inviteeDiscordId = asText(invite.invitee_discord_id);
      const dmUpdate: Record<string, unknown> = {
        dm_error: null,
        dm_sent_at: null,
        dm_status: inviteeDiscordId ? "pending" : "skipped",
      };

      if (inviteeDiscordId) {
        try {
          await sendDiscordInviteDm(config, {
            inviteUrl,
            reason: asText(invite.reason),
            recipientId: inviteeDiscordId,
            requestedByName: asText(invite.requested_by_name),
          });
          dmUpdate.dm_sent_at = new Date().toISOString();
          dmUpdate.dm_status = "sent";
          summary.dmSent += 1;
        } catch (dmError) {
          dmUpdate.dm_error = truncateMessage(getErrorMessage(dmError));
          dmUpdate.dm_status = "failed";
          summary.dmFailed += 1;
        }
      } else {
        summary.dmSkipped += 1;
      }

      const { error: updateError } = await supabase
        .from("discord_invite_requests")
        .update({
          bot_error: null,
          discord_invite_code: code,
          discord_invite_url: inviteUrl,
          status: "created",
          uses: 0,
          ...dmUpdate,
        })
        .eq("id", id);

      if (updateError) {
        throw new Error(`Invite update failed: ${updateError.message}`);
      }

      summary.created += 1;
    } catch (error) {
      summary.failed += 1;
      await markInviteFailed(supabase, id, getErrorMessage(error));
    }
  }

  return summary;
}

async function createDiscordInvite(
  config: DiscordSyncConfig,
  invite: {
    id: string;
    inviteeName: string | null;
    reason: string | null;
    requestedByName: string | null;
  },
) {
  const reason = encodeAuditReason(
    [
      "Schland DB invite",
      invite.inviteeName ? `for ${invite.inviteeName}` : null,
      invite.requestedByName ? `by ${invite.requestedByName}` : null,
      invite.reason ? `reason: ${invite.reason}` : null,
      `request: ${invite.id}`,
    ]
      .filter(Boolean)
      .join(" | "),
  );

  return discordRequest<DiscordInvite>(
    config,
    `/channels/${config.inviteChannelId}/invites`,
    {
      body: JSON.stringify({
        max_age: INVITE_MAX_AGE_SECONDS,
        max_uses: 1,
        temporary: false,
        unique: true,
      }),
      headers: {
        "X-Audit-Log-Reason": reason,
      },
      method: "POST",
    },
  );
}

async function markInviteFailed(
  supabase: SupabaseAdminClient,
  id: string,
  message: string,
) {
  const { error } = await supabase
    .from("discord_invite_requests")
    .update({
      bot_error: truncateMessage(message),
      status: "failed",
    })
    .eq("id", id);

  if (error) {
    console.error("discord invite failure update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
  }
}

async function syncDiscordMembers(
  supabase: SupabaseAdminClient,
  config: DiscordSyncConfig,
): Promise<MemberSyncSummary> {
  const summary: MemberSyncSummary = {
    coverageComplete: false,
    failed: 0,
    guildMemberEstimate: null,
    guildName: null,
    guildPresenceEstimate: null,
    missingEstimate: null,
    pageLimitHit: false,
    rolesSynced: 0,
    scanned: 0,
    skippedBots: 0,
    upserted: 0,
  };
  const roleMap = await syncGuildRoles(supabase, config);
  const guildSummary = await fetchGuildSummary(config).catch((error) => {
    console.error("discord guild summary failed", {
      error: getErrorMessage(error),
    });

    return null;
  });

  if (guildSummary) {
    summary.guildName = asText(guildSummary.name);
    summary.guildMemberEstimate = asOptionalNumber(
      guildSummary.approximate_member_count,
    );
    summary.guildPresenceEstimate = asOptionalNumber(
      guildSummary.approximate_presence_count,
    );
  }

  let after = "0";

  for (let page = 0; page < MEMBER_MAX_PAGES; page += 1) {
    const members = await fetchGuildMembers(config, after);

    if (members.length === 0) {
      break;
    }

    for (const member of members) {
      summary.scanned += 1;

      try {
        const result = await upsertDiscordMember(supabase, member, roleMap);

        if (result === "bot") {
          summary.skippedBots += 1;
        } else if (result) {
          summary.upserted += 1;
          summary.rolesSynced += result.rolesSynced;
        }
      } catch (error) {
        summary.failed += 1;
        console.error("discord member upsert failed", {
          error: getErrorMessage(error),
          userId: asText(member.user?.id),
        });
      }
    }

    const lastMember = members[members.length - 1];
    const lastUserId = asText(lastMember?.user?.id);

    if (!lastUserId || members.length < MEMBER_PAGE_LIMIT) {
      break;
    }

    if (page === MEMBER_MAX_PAGES - 1) {
      summary.pageLimitHit = true;
      break;
    }

    after = lastUserId;
  }

  if (summary.guildMemberEstimate !== null) {
    summary.missingEstimate = Math.max(
      0,
      summary.guildMemberEstimate - summary.scanned,
    );
  }

  summary.coverageComplete =
    !summary.pageLimitHit &&
    (summary.missingEstimate === null || summary.missingEstimate === 0);

  return summary;
}

async function syncGuildRoles(
  supabase: SupabaseAdminClient,
  config: DiscordSyncConfig,
) {
  const roles = await discordRequest<DiscordGuildRole[]>(
    config,
    `/guilds/${config.guildId}/roles`,
    { method: "GET" },
  );
  const rows = roles
    .map((role) => ({
      discord_role_id: asText(role.id),
      last_synced_at: new Date().toISOString(),
      role_name: asText(role.name),
    }))
    .filter((role) => role.discord_role_id && role.role_name);

  if (rows.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("discord_roles")
    .upsert(rows, { onConflict: "discord_role_id" })
    .select("id,discord_role_id");

  if (error) {
    throw new Error(`Discord role sync failed: ${error.message}`);
  }

  const roleMap = new Map<string, string>();

  for (const row of data ?? []) {
    const discordRoleId = asText(asRecord(row).discord_role_id);
    const id = asText(asRecord(row).id);

    if (discordRoleId && id) {
      roleMap.set(discordRoleId, id);
    }
  }

  return roleMap;
}

async function fetchGuildMembers(
  config: DiscordSyncConfig,
  after: string,
) {
  const searchParams = new URLSearchParams({
    after,
    limit: String(MEMBER_PAGE_LIMIT),
  });

  return discordRequest<DiscordGuildMember[]>(
    config,
    `/guilds/${config.guildId}/members?${searchParams.toString()}`,
    { method: "GET" },
  );
}

async function fetchGuildSummary(config: DiscordSyncConfig) {
  return discordRequest<DiscordGuildSummary>(
    config,
    `/guilds/${config.guildId}?with_counts=true`,
    { method: "GET" },
  );
}

async function upsertDiscordMember(
  supabase: SupabaseAdminClient,
  member: DiscordGuildMember,
  roleMap: Map<string, string>,
) {
  const user = member.user;
  const discordId = asText(user?.id);

  if (!discordId) {
    return null;
  }

  if (user?.bot) {
    return "bot" as const;
  }

  const discordUsername = formatDiscordUser(user ?? {});
  const displayName =
    asText(member.nick) ??
    asText(user?.global_name) ??
    asText(user?.username) ??
    discordId;
  const now = new Date().toISOString();
  const joinedAt = asIsoDate(member.joined_at);
  const payload = {
    discord_display_name: displayName,
    discord_id: discordId,
    discord_is_bot: false,
    discord_joined_at: joinedAt,
    discord_last_seen_at: now,
    discord_on_server: true,
    discord_username: discordUsername,
    name: displayName,
    notes: "Automatisch durch Discord-Sync angelegt.",
  };

  const { data, error } = await supabase
    .from("members")
    .upsert(payload, { onConflict: "discord_id" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Member upsert failed: ${error.message}`);
  }

  const memberId = asText(asRecord(data).id);

  if (!memberId) {
    return null;
  }

  const roleIds = Array.isArray(member.roles) ? member.roles : [];
  const mappedRoleIds = roleIds
    .map((roleId) => roleMap.get(roleId))
    .filter((roleId): roleId is string => Boolean(roleId));

  const { error: deleteError } = await supabase
    .from("member_discord_roles")
    .delete()
    .eq("member_id", memberId);

  if (deleteError) {
    throw new Error(`Member role cleanup failed: ${deleteError.message}`);
  }

  if (mappedRoleIds.length > 0) {
    const { error: insertError } = await supabase
      .from("member_discord_roles")
      .insert(
        mappedRoleIds.map((discordRoleId) => ({
          discord_role_id: discordRoleId,
          member_id: memberId,
          synced_at: now,
        })),
      );

    if (insertError) {
      throw new Error(`Member role write failed: ${insertError.message}`);
    }
  }

  return { memberId, rolesSynced: mappedRoleIds.length };
}

async function sendDiscordInviteDm(
  config: DiscordSyncConfig,
  invite: {
    inviteUrl: string;
    reason: string | null;
    recipientId: string;
    requestedByName: string | null;
  },
) {
  const channel = await discordRequest<DiscordDmChannel>(
    config,
    "/users/@me/channels",
    {
      body: JSON.stringify({ recipient_id: invite.recipientId }),
      method: "POST",
    },
  );
  const channelId = asText(channel.id);

  if (!channelId) {
    throw new Error("Discord returned no DM channel.");
  }

  await discordRequest(config, `/channels/${channelId}/messages`, {
    body: JSON.stringify({
      content: [
        "Du wurdest auf den Schland Discord eingeladen.",
        invite.inviteUrl,
        invite.requestedByName ? `Angelegt von: ${invite.requestedByName}` : null,
        invite.reason ? `Grund: ${invite.reason}` : null,
        "Der Link ist einmal verwendbar und 1 Tag gueltig.",
      ]
        .filter(Boolean)
        .join("\n"),
    }),
    method: "POST",
  });
}

export async function executeDiscordModerationAction(input: {
  actionType: "ban" | "kick" | "timeout" | "voice_disconnect" | "warn";
  discordUserId?: string | null;
  durationMode?: "lifetime" | "timed";
  durationSeconds: number | null;
  memberId?: string | null;
  moderatorName?: string | null;
  reason: string;
  targetName?: string | null;
}) {
  const supabase = getSupabaseAdminClient();

  let memberRow: Record<string, unknown> | null = null;

  if (input.memberId) {
    const { data, error } = await supabase
      .from("members")
      .select("id,name,discord_id,discord_username,discord_display_name")
      .eq("id", input.memberId)
      .maybeSingle();

    if (error) {
      throw new Error(`Discord member lookup failed: ${error.message}`);
    }

    memberRow = asRecord(data);
  } else if (input.discordUserId) {
    const { data, error } = await supabase
      .from("members")
      .select("id,name,discord_id,discord_username,discord_display_name")
      .eq("discord_id", input.discordUserId)
      .maybeSingle();

    if (error) {
      throw new Error(`Discord member lookup failed: ${error.message}`);
    }

    memberRow = data ? asRecord(data) : null;
  }

  const discordUserId = asText(memberRow?.discord_id) ?? input.discordUserId;

  if (!discordUserId) {
    throw new Error("Discord member not found.");
  }

  const reason = input.reason.trim();
  const startedAt = new Date();
  const endedAt =
    input.actionType === "timeout" && input.durationSeconds
      ? new Date(startedAt.getTime() + input.durationSeconds * 1000)
      : null;
  const durationMode =
    input.actionType === "timeout" ? "timed" : input.durationMode ?? "lifetime";
  const lifetime =
    input.actionType === "ban" ||
    (input.actionType !== "timeout" && durationMode === "lifetime");

  const payload = {
    discord_user_id: discordUserId,
    discord_username: String(
      memberRow?.discord_display_name ??
        memberRow?.discord_username ??
        memberRow?.name ??
        input.targetName ??
        discordUserId,
    ),
    duration_seconds:
      input.actionType === "timeout" ? input.durationSeconds : null,
    ended_at: endedAt?.toISOString() ?? null,
    event_type: input.actionType,
    external_event_id: `web-command-${crypto.randomUUID()}`,
    last_synced_at: new Date().toISOString(),
    member_id: asText(memberRow?.id),
    metadata: {
      actionSource: "web",
      commandStatus: "pending",
      durationMode,
      lifetime,
    },
    moderator_name: input.moderatorName ?? "Website",
    reason,
    source: "schland-web-command",
    started_at: startedAt.toISOString(),
    status: "recorded",
  };

  const { error } = await supabase.from("discord_moderation_events").insert(payload);

  if (error) {
    throw new Error(`Moderation command write failed: ${error.message}`);
  }
}

async function syncModerationAuditLogs(
  supabase: SupabaseAdminClient,
  config: DiscordSyncConfig,
  currentSyncRunId: string,
): Promise<ModerationSyncSummary> {
  const previousLastAuditLogId = await getLastAuditLogId(
    supabase,
    currentSyncRunId,
  );
  const summary: ModerationSyncSummary = {
    failed: 0,
    lastAuditLogId: previousLastAuditLogId,
    recorded: 0,
    scanned: 0,
    skipped: 0,
  };
  const events = new Map<string, ModerationEventPayload>();

  for (const actionType of Object.values(AUDIT_LOG_ACTIONS)) {
    const response = await fetchAuditLogs(config, actionType, previousLastAuditLogId);
    const userMap = createUserMap(response.users ?? []);

    for (const entry of response.audit_log_entries ?? []) {
      const id = asText(entry.id);

      if (!id) {
        summary.skipped += 1;
        continue;
      }

      summary.scanned += 1;
      summary.lastAuditLogId = getHighestSnowflake(summary.lastAuditLogId, id);

      const event = mapAuditLogEntry(entry, userMap);

      if (!event) {
        summary.skipped += 1;
        continue;
      }

      events.set(event.externalEventId, event);
    }
  }

  for (const event of events.values()) {
    try {
      await upsertModerationEvent(supabase, event);
      summary.recorded += 1;
    } catch (error) {
      summary.failed += 1;
      console.error("discord moderation event sync failed", {
        error: getErrorMessage(error),
        externalEventId: event.externalEventId,
      });
    }
  }

  return summary;
}

async function getLastAuditLogId(
  supabase: SupabaseAdminClient,
  currentSyncRunId: string,
) {
  const { data, error } = await supabase
    .from("sync_runs")
    .select("metadata")
    .eq("source", "discord")
    .neq("id", currentSyncRunId)
    .in("status", ["success", "partial"])
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Last audit log lookup failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];

  for (const row of rows) {
    const metadata = asRecord(asRecord(row).metadata);
    const lastAuditLogId = asText(metadata.lastAuditLogId);

    if (lastAuditLogId) {
      return lastAuditLogId;
    }
  }

  return null;
}

async function fetchAuditLogs(
  config: DiscordSyncConfig,
  actionType: number,
  after: string | null,
) {
  const searchParams = new URLSearchParams({
    action_type: String(actionType),
    limit: String(AUDIT_LOG_BATCH_LIMIT),
  });

  if (after) {
    searchParams.set("after", after);
  }

  return discordRequest<DiscordAuditLogResponse>(
    config,
    `/guilds/${config.guildId}/audit-logs?${searchParams.toString()}`,
    { method: "GET" },
  );
}

function mapAuditLogEntry(
  entry: DiscordAuditLogEntry,
  users: Map<string, DiscordUserInfo>,
): ModerationEventPayload | null {
  const id = asText(entry.id);
  const actionType = Number(entry.action_type);
  const startedAt = id ? snowflakeToDate(id).toISOString() : new Date().toISOString();
  const options = asRecord(entry.options);
  const targetId =
    asText(entry.target_id) ??
    asText(options.target_id) ??
    asText(options.user_id) ??
    "unknown";
  const moderator = asText(entry.user_id)
    ? users.get(String(entry.user_id))
    : null;

  if (moderator?.isBot) {
    return null;
  }

  const base = {
    channelId: asText(options.channel_id),
    channelName: asText(options.channel_name),
    discordUserId: targetId,
    discordUsername: users.get(targetId)?.name ?? null,
    externalEventId: id ?? crypto.randomUUID(),
    metadata: {
      auditActionType: actionType,
      changes: entry.changes ?? [],
      options,
    },
    moderatorDiscordId: asText(entry.user_id),
    moderatorName: moderator?.name ?? null,
    reason: asText(entry.reason),
    startedAt,
  };

  if (actionType === AUDIT_LOG_ACTIONS.MEMBER_KICK) {
    return {
      ...base,
      durationSeconds: null,
      endedAt: null,
      eventType: "kick",
      status: "recorded",
    };
  }

  if (actionType === AUDIT_LOG_ACTIONS.MEMBER_BAN_ADD) {
    return {
      ...base,
      durationSeconds: null,
      endedAt: null,
      eventType: "ban",
      metadata: {
        ...base.metadata,
        durationMode: "lifetime",
        lifetime: true,
      },
      status: "active",
    };
  }

  if (actionType === AUDIT_LOG_ACTIONS.MEMBER_BAN_REMOVE) {
    return {
      ...base,
      durationSeconds: null,
      endedAt: startedAt,
      eventType: "ban",
      status: "lifted",
    };
  }

  if (actionType === AUDIT_LOG_ACTIONS.MEMBER_DISCONNECT) {
    return {
      ...base,
      durationSeconds: null,
      endedAt: null,
      eventType: "voice_disconnect",
      status: "recorded",
    };
  }

  if (
    actionType === AUDIT_LOG_ACTIONS.MEMBER_UPDATE ||
    actionType === AUDIT_LOG_ACTIONS.AUTO_MODERATION_USER_COMMUNICATION_DISABLED
  ) {
    return mapTimeoutEvent(entry, base);
  }

  return null;
}

function mapTimeoutEvent(
  entry: DiscordAuditLogEntry,
  base: Omit<
    ModerationEventPayload,
    "durationSeconds" | "endedAt" | "eventType" | "status"
  >,
): ModerationEventPayload | null {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  const timeoutChange = changes.find(
    (change) => change.key === "communication_disabled_until",
  );

  if (!timeoutChange) {
    return null;
  }

  const newUntil = asIsoDate(timeoutChange.new_value);
  const oldUntil = asIsoDate(timeoutChange.old_value);

  if (newUntil) {
    const startedAtMs = new Date(base.startedAt).getTime();
    const endedAtMs = new Date(newUntil).getTime();
    const durationSeconds = Math.max(
      0,
      Math.round((endedAtMs - startedAtMs) / 1000),
    );

    return {
      ...base,
      durationSeconds,
      endedAt: newUntil,
      eventType: "timeout",
      status: endedAtMs <= Date.now() ? "expired" : "active",
    };
  }

  if (oldUntil) {
    return {
      ...base,
      durationSeconds: null,
      endedAt: base.startedAt,
      eventType: "timeout",
      status: "lifted",
    };
  }

  return null;
}

async function upsertModerationEvent(
  supabase: SupabaseAdminClient,
  event: ModerationEventPayload,
) {
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("discord_id", event.discordUserId)
    .maybeSingle();

  if (memberError) {
    throw new Error(`Member lookup failed: ${memberError.message}`);
  }

  const payload: Record<string, unknown> = {
    channel_id: event.channelId,
    channel_name: event.channelName,
    discord_user_id: event.discordUserId,
    discord_username: event.discordUsername,
    duration_seconds: event.durationSeconds,
    ended_at: event.endedAt,
    event_type: event.eventType,
    external_event_id: event.externalEventId,
    last_synced_at: new Date().toISOString(),
    member_id: member?.id ?? null,
    metadata: event.metadata,
    moderator_discord_id: event.moderatorDiscordId,
    moderator_name: event.moderatorName,
    reason: event.reason,
    source: DISCORD_AUDIT_LOG_SOURCE,
    started_at: event.startedAt,
    status: event.status,
  };

  const { error } = await supabase
    .from("discord_moderation_events")
    .upsert(payload, { onConflict: "source,external_event_id" });

  if (error) {
    throw new Error(`Moderation event write failed: ${error.message}`);
  }
}

async function discordRequest<T>(
  config: DiscordSyncConfig,
  path: string,
  init: RequestInit,
) {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${config.botToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok) {
    const discordError = asRecord(body);
    const message =
      asText(discordError.message) ??
      (text ? truncateMessage(text) : response.statusText);

    throw new Error(`Discord ${response.status}: ${message}`);
  }

  return (body ?? {}) as T;
}

function createUserMap(users: DiscordUser[]) {
  const map = new Map<string, DiscordUserInfo>();

  for (const user of users) {
    const id = asText(user.id);

    if (id) {
      map.set(id, {
        isBot: user.bot === true,
        name: formatDiscordUser(user),
      });
    }
  }

  return map;
}

function formatDiscordUser(user: DiscordUser) {
  return (
    asText(user.global_name) ??
    asText(user.username) ??
    asText(user.id) ??
    "Unbekannt"
  );
}

function snowflakeToDate(snowflake: string) {
  try {
    const timestamp = (BigInt(snowflake) >> BigInt(22)) + DISCORD_EPOCH;
    return new Date(Number(timestamp));
  } catch {
    return new Date();
  }
}

function getHighestSnowflake(current: string | null, candidate: string) {
  if (!current) {
    return candidate;
  }

  try {
    return BigInt(candidate) > BigInt(current) ? candidate : current;
  } catch {
    return candidate > current ? candidate : current;
  }
}

function encodeAuditReason(reason: string) {
  return encodeURIComponent(reason.replace(/[\r\n]+/g, " ").slice(0, 300));
}

function parseJson(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function truncateMessage(message: string) {
  return message.slice(0, 500);
}

function asOptionalNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}
