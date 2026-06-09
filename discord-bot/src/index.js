import { setTimeout as delay } from "node:timers/promises";

import {
  AuditLogEvent,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
} from "discord.js";

const config = loadConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const disabledAnalyticsIds = new Set();
const messageCounts = new Map();
const seenAuditLogIds = new Set();
const voiceSessions = new Map();
const timers = [];

let invitePollRunning = false;
let auditPollRunning = false;
let fullSyncRunning = false;
let heartbeatRunning = false;
let messageFlushRunning = false;
let moderationPollRunning = false;
let voiceFlushRunning = false;
let lastFullSyncStats = null;
let moderationQueueSize = 0;

client.once(Events.ClientReady, async () => {
  console.log(`Schland bot online as ${client.user.tag}`);

  await refreshPrivacy();
  await fullSyncGuild("startup");
  await primeVoiceSessions();
  await pollInvites();
  await pollModerationActions();
  await pollAuditLogs("startup");
  await sendHeartbeat();

  timers.push(setInterval(() => void flushMessages(), config.activityFlushMs));
  timers.push(setInterval(() => void flushVoiceSessions(), config.voiceFlushMs));
  timers.push(setInterval(() => void sendHeartbeat(), config.heartbeatMs));
  timers.push(setInterval(() => void pollInvites(), config.invitePollMs));
  timers.push(setInterval(() => void pollModerationActions(), config.moderationPollMs));
  timers.push(setInterval(() => void refreshPrivacy(), config.privacyRefreshMs));
  timers.push(setInterval(() => void fullSyncGuild("interval"), config.fullSyncIntervalMs));
  timers.push(setInterval(() => void pollAuditLogs("interval"), config.auditPollMs));
});

client.on(Events.GuildMemberAdd, (member) => {
  if (!isConfiguredGuild(member.guild.id) || member.user.bot) {
    return;
  }

  void syncMember(member, "join");
});

client.on(Events.GuildMemberRemove, (member) => {
  if (!isConfiguredGuild(member.guild.id) || member.user.bot) {
    return;
  }

  void markMemberLeft(member);
  void delayedAuditPoll("member-remove");
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  if (!isConfiguredGuild(newMember.guild.id) || newMember.user.bot) {
    return;
  }

  void syncMember(newMember, "update");

  const oldTimeout = oldMember.communicationDisabledUntil?.getTime() ?? 0;
  const newTimeout = newMember.communicationDisabledUntil?.getTime() ?? 0;

  if (oldTimeout !== newTimeout) {
    void delayedAuditPoll("member-timeout");
  }
});

client.on(Events.MessageCreate, (message) => {
  if (!message.guild || !isConfiguredGuild(message.guild.id)) {
    return;
  }

  if (message.author.bot || disabledAnalyticsIds.has(message.author.id)) {
    return;
  }

  const existing = messageCounts.get(message.author.id) ?? {
    count: 0,
    displayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
    lastAt: new Date().toISOString(),
    username: formatUser(message.author),
  };

  existing.count += 1;
  existing.lastAt = message.createdAt?.toISOString() ?? new Date().toISOString();
  messageCounts.set(message.author.id, existing);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (!isConfiguredGuild(newState.guild.id)) {
    return;
  }

  const user = newState.member?.user ?? oldState.member?.user;

  if (!user || user.bot || disabledAnalyticsIds.has(user.id)) {
    return;
  }

  if (oldState.channelId === newState.channelId) {
    return;
  }

  if (oldState.channelId) {
    void endVoiceSession(user.id, {
      channelId: oldState.channelId,
      channelName: oldState.channel?.name ?? null,
      displayName: oldState.member?.displayName ?? user.globalName ?? user.username,
      username: formatUser(user),
    });
  }

  if (newState.channelId) {
    startVoiceSession(user.id, {
      channelId: newState.channelId,
      channelName: newState.channel?.name ?? null,
      displayName: newState.member?.displayName ?? user.globalName ?? user.username,
      username: formatUser(user),
    });
  }
});

client.on(Events.GuildBanAdd, (ban) => {
  if (!isConfiguredGuild(ban.guild.id) || ban.user.bot) {
    return;
  }

  void delayedAuditPoll("ban-add");
});

client.on(Events.GuildBanRemove, (ban) => {
  if (!isConfiguredGuild(ban.guild.id) || ban.user.bot) {
    return;
  }

  void delayedAuditPoll("ban-remove");
});

client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
  if (!guild || !isConfiguredGuild(guild.id)) {
    return;
  }

  void handleAuditLogEntry(entry, "gateway-event");
});

client.on(Events.Error, (error) => {
  console.error("Discord client error", error);
});

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await client.login(config.discordBotToken);

async function fullSyncGuild(trigger) {
  if (fullSyncRunning) {
    return;
  }

  fullSyncRunning = true;

  try {
    const guild = await getGuild();
    await guild.roles.fetch();
    const members = await guild.members.fetch();
    const humans = [...members.values()].filter((member) => !member.user.bot);
    let synced = 0;

    for (const chunk of chunkArray(humans, 50)) {
      await api("/members", {
        body: {
          members: chunk.map(memberToPayload),
        },
      });
      synced += chunk.length;
    }

    await api("/members", {
      body: {
        action: "reconcile",
        currentDiscordUserIds: humans.map((member) => member.id),
        guildMemberEstimate: members.size,
        guildName: guild.name,
        skippedBots: members.size - humans.length,
      },
      method: "PATCH",
    });

    lastFullSyncStats = {
      guildMemberEstimate: members.size,
      guildName: guild.name,
      humansOnServer: humans.length,
      skippedBots: members.size - humans.length,
    };

    await sendHeartbeat();

    console.log(`Full member sync (${trigger}) done: ${synced} humans, ${members.size - humans.length} bots skipped`);
  } catch (error) {
    console.error(`Full member sync (${trigger}) failed`, errorMessage(error));
  } finally {
    fullSyncRunning = false;
  }
}

async function syncMember(member, trigger) {
  try {
    const result = await api("/members", {
      body: memberToPayload(member),
    });

    if (result.member) {
      console.log(`Member ${trigger}: ${result.member.name}`);
      await sendHeartbeat();
    }
  } catch (error) {
    console.error(`Member ${trigger} failed`, errorMessage(error));
  }
}

async function markMemberLeft(member) {
  try {
    await api("/members", {
      body: {
        action: "left",
        discordUserId: member.id,
        discordUsername: formatUser(member.user),
        isBot: member.user.bot,
      },
    });
    await sendHeartbeat();
  } catch (error) {
    console.error("Member leave sync failed", errorMessage(error));
  }
}

async function flushMessages() {
  if (messageFlushRunning || messageCounts.size === 0) {
    return;
  }

  messageFlushRunning = true;

  try {
    for (const [discordUserId, entry] of [...messageCounts.entries()]) {
      await api("/activity", {
        body: {
          count: entry.count,
          discordDisplayName: entry.displayName,
          discordUserId,
          discordUsername: entry.username,
          eventType: "message",
          occurredAt: entry.lastAt,
        },
      });
      messageCounts.delete(discordUserId);
    }
    await sendHeartbeat();
  } catch (error) {
    console.error("Message activity flush failed", errorMessage(error));
  } finally {
    messageFlushRunning = false;
  }
}

async function primeVoiceSessions() {
  try {
    const guild = await getGuild();

    for (const state of guild.voiceStates.cache.values()) {
      const user = state.member?.user;

      if (!state.channelId || !user || user.bot || disabledAnalyticsIds.has(user.id)) {
        continue;
      }

      startVoiceSession(user.id, {
        channelId: state.channelId,
        channelName: state.channel?.name ?? null,
        displayName: state.member?.displayName ?? user.globalName ?? user.username,
        username: formatUser(user),
      });
    }
  } catch (error) {
    console.error("Voice session prime failed", errorMessage(error));
  }
}

function startVoiceSession(discordUserId, data) {
  const now = new Date().toISOString();

  voiceSessions.set(discordUserId, {
    ...data,
    lastFlushedAt: now,
    startedAt: now,
  });
}

async function endVoiceSession(discordUserId, fallback) {
  const session = voiceSessions.get(discordUserId);

  if (!session) {
    return;
  }

  voiceSessions.delete(discordUserId);

  const endedAt = new Date().toISOString();
  const startedAt = session.lastFlushedAt ?? session.startedAt;
  const durationSeconds = Math.round(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );

  if (durationSeconds < 60) {
    return;
  }

  try {
    await api("/activity", {
      body: {
        channelId: session.channelId ?? fallback.channelId,
        channelName: session.channelName ?? fallback.channelName,
        discordDisplayName: session.displayName ?? fallback.displayName,
        discordUserId,
        discordUsername: session.username ?? fallback.username,
        durationSeconds,
        endedAt,
        eventType: "voice_session",
        startedAt,
      },
    });
  } catch (error) {
    console.error("Voice activity write failed", errorMessage(error));
  }
}

async function flushVoiceSessions() {
  if (voiceFlushRunning || voiceSessions.size === 0) {
    return;
  }

  voiceFlushRunning = true;

  try {
    const now = new Date();

    for (const [discordUserId, session] of voiceSessions.entries()) {
      const lastFlushedAt = new Date(session.lastFlushedAt ?? session.startedAt);
      const durationSeconds = Math.round(
        (now.getTime() - lastFlushedAt.getTime()) / 1000,
      );

      if (!Number.isFinite(durationSeconds) || durationSeconds < 60) {
        continue;
      }

      const endedAt = now.toISOString();

      await api("/activity", {
        body: {
          channelId: session.channelId,
          channelName: session.channelName,
          discordDisplayName: session.displayName,
          discordUserId,
          discordUsername: session.username,
          durationSeconds,
          endedAt,
          eventType: "voice_session",
          startedAt: lastFlushedAt.toISOString(),
        },
      });

      session.lastFlushedAt = endedAt;
      voiceSessions.set(discordUserId, session);
    }
    await sendHeartbeat();
  } catch (error) {
    console.error("Voice activity flush failed", errorMessage(error));
  } finally {
    voiceFlushRunning = false;
  }
}

async function pollInvites() {
  if (invitePollRunning) {
    return;
  }

  invitePollRunning = true;

  try {
    const result = await api("/invites", { method: "GET" });

    for (const invite of result.invites ?? []) {
      await processInvite(invite);
    }
  } catch (error) {
    console.error("Invite poll failed", errorMessage(error));
  } finally {
    invitePollRunning = false;
  }
}

async function processInvite(inviteRequest) {
  if (inviteRequest.status === "cancelled") {
    await cancelInvite(inviteRequest);
    return;
  }

  try {
    const channel = await client.channels.fetch(config.inviteChannelId);

    if (!channel || typeof channel.createInvite !== "function") {
      throw new Error("Invite channel cannot create invites");
    }

    const invite = await channel.createInvite({
      maxAge: 24 * 60 * 60,
      maxUses: 1,
      reason: trimReason(
        `Schland Einladung fuer ${inviteRequest.inviteeName}: ${inviteRequest.reason}`,
      ),
      unique: true,
    });

    const dm = await sendInviteDm(inviteRequest, invite.url);

    await api("/invites", {
      body: {
        discordInviteCode: invite.code,
        discordInviteUrl: invite.url,
        dmError: dm.error,
        dmStatus: dm.status,
        id: inviteRequest.id,
        status: "created",
      },
      method: "PATCH",
    });

    console.log(`Invite created for ${inviteRequest.inviteeName}`);
  } catch (error) {
    console.error("Invite create failed", errorMessage(error));

    await api("/invites", {
      body: {
        botError: errorMessage(error),
        id: inviteRequest.id,
        status: "failed",
      },
      method: "PATCH",
    }).catch((updateError) => {
      console.error("Invite failure update failed", errorMessage(updateError));
    });
  }
}

async function cancelInvite(inviteRequest) {
  try {
    if (inviteRequest.discordInviteCode) {
      await discordApi(`/invites/${inviteRequest.discordInviteCode}`, {
        method: "DELETE",
      });
    }

    await api("/invites", {
      body: {
        botError: null,
        id: inviteRequest.id,
        status: "cancelled",
      },
      method: "PATCH",
    });

    console.log(`Invite cancelled for ${inviteRequest.inviteeName}`);
  } catch (error) {
    const message = errorMessage(error);

    if (!message.includes("Discord 404")) {
      console.error("Invite cancel failed", message);
    }

    await api("/invites", {
      body: {
        botError: message.includes("Discord 404") ? null : message,
        id: inviteRequest.id,
        status: "cancelled",
      },
      method: "PATCH",
    }).catch((updateError) => {
      console.error("Invite cancel update failed", errorMessage(updateError));
    });
  }
}

async function sendInviteDm(inviteRequest, inviteUrl) {
  if (!inviteRequest.inviteeDiscordId) {
    return { error: null, status: "skipped" };
  }

  try {
    const user = await client.users.fetch(inviteRequest.inviteeDiscordId);

    await user.send(
      [
        "Du wurdest auf den Schland Discord eingeladen.",
        inviteUrl,
        inviteRequest.requestedByName
          ? `Angelegt von: ${inviteRequest.requestedByName}`
          : null,
        inviteRequest.reason ? `Grund: ${inviteRequest.reason}` : null,
        "Der Link ist einmal verwendbar und 1 Tag gueltig.",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    return { error: null, status: "sent" };
  } catch (error) {
    return { error: errorMessage(error), status: "failed" };
  }
}

async function refreshPrivacy() {
  try {
    const result = await api("/privacy", { method: "GET" });
    disabledAnalyticsIds.clear();

    for (const id of result.disabledDiscordIds ?? []) {
      disabledAnalyticsIds.add(id);
      voiceSessions.delete(id);
      messageCounts.delete(id);
    }
  } catch (error) {
    console.error("Privacy refresh failed", errorMessage(error));
  }
}

async function pollModerationActions() {
  if (moderationPollRunning) {
    return;
  }

  moderationPollRunning = true;

  try {
    const result = await api("/moderation-actions", { method: "GET" });
    const actions = Array.isArray(result.actions) ? result.actions : [];
    moderationQueueSize = actions.length;

    for (const action of actions) {
      await processModerationAction(action);
    }

    await sendHeartbeat();
  } catch (error) {
    console.error("Moderation action poll failed", errorMessage(error));
  } finally {
    moderationPollRunning = false;
  }
}

async function processModerationAction(action) {
  const startedAt = new Date().toISOString();

  try {
    await api("/moderation-actions", {
      body: {
        id: action.id,
        commandStatus: "running",
        startedAt,
      },
      method: "PATCH",
    });

    const result = await executeModerationAction(action, startedAt);

    await api("/moderation-actions", {
      body: {
        commandStatus: "executed",
        dmError: result.dmError,
        dmStatus: result.dmStatus,
        durationSeconds: result.durationSeconds,
        endedAt: result.endedAt,
        id: action.id,
        startedAt: result.startedAt,
      },
      method: "PATCH",
    });

    moderationQueueSize = Math.max(0, moderationQueueSize - 1);
    console.log(`Moderation action executed: ${action.eventType} ${action.discordUserId}`);
  } catch (error) {
    moderationQueueSize = Math.max(0, moderationQueueSize - 1);
    console.error("Moderation action failed", errorMessage(error));

    await api("/moderation-actions", {
      body: {
        botError: errorMessage(error),
        commandStatus: "failed",
        id: action.id,
        startedAt,
      },
      method: "PATCH",
    }).catch((updateError) => {
      console.error("Moderation action failure update failed", errorMessage(updateError));
    });
  }
}

async function executeModerationAction(action, startedAt) {
  const guild = await getGuild();
  const knownAction = getModerationActionInfo(action.eventType);

  if (!knownAction) {
    throw new Error(`Unbekannte Moderationsaktion: ${action.eventType}`);
  }

  const reason = trimReason(
    `Schland ${action.eventType}: ${action.reason ?? "kein Grund"}`,
  );
  const durationSeconds =
    action.eventType === "timeout"
      ? Math.min(Math.max(Number(action.durationSeconds ?? 0), 60), 28 * 24 * 60 * 60)
      : null;
  const endedAt =
    durationSeconds !== null
      ? new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString()
      : null;
  const dmResult = await sendModerationDirectMessage(action, {
    durationSeconds,
    endedAt,
    startedAt,
  });

  if (action.eventType === "ban") {
    await guild.members.ban(action.discordUserId, {
      deleteMessageSeconds: 0,
      reason,
    });
  } else if (action.eventType === "kick") {
    const member = await guild.members.fetch(action.discordUserId);
    await member.kick(reason);
  } else if (action.eventType === "timeout") {
    if (!durationSeconds) {
      throw new Error("Timeout braucht eine gueltige Dauer.");
    }

    const member = await guild.members.fetch(action.discordUserId);
    await member.timeout(durationSeconds * 1000, reason);
  } else if (action.eventType === "voice_disconnect") {
    const member = await guild.members.fetch(action.discordUserId);

    if (!member.voice.channelId) {
      throw new Error("Mitglied ist nicht im Voice.");
    }

    await member.voice.disconnect(reason);
  } else if (action.eventType === "warn") {
    // Warns are delivered through the direct message above.
  }

  return {
    dmError: dmResult.error,
    dmStatus: dmResult.status,
    durationSeconds,
    endedAt,
    startedAt,
  };
}

async function sendModerationDirectMessage(action, context) {
  try {
    const user = await client.users.fetch(action.discordUserId);

    await user.send({
      embeds: [buildModerationDirectMessageEmbed(action, context)],
    });

    return { error: null, status: "sent" };
  } catch (error) {
    console.warn(
      `Moderation DM failed for ${action.discordUserId}`,
      errorMessage(error),
    );

    return { error: errorMessage(error), status: "failed" };
  }
}

function buildModerationDirectMessageEmbed(action, context) {
  const info = getModerationActionInfo(action.eventType);
  const title = info ? info.label : "Moderation";
  const color = info ? info.color : 0x263f72;
  const fields = [
    { name: "Aktion", value: title, inline: true },
    {
      name: "Status",
      value: action.eventType === "warn" ? "Hinweis erfasst" : "Wird umgesetzt",
      inline: true,
    },
    {
      name: "Dauer",
      value: formatModerationDirectMessageDuration(action, context),
      inline: true,
    },
    {
      name: "Grund",
      value: trimEmbedField(action.reason ?? "Kein Grund angegeben."),
      inline: false,
    },
  ];

  if (action.moderatorName) {
    fields.push({
      name: "Ausgestellt von",
      value: trimEmbedField(action.moderatorName),
      inline: true,
    });
  }

  if (context.endedAt) {
    fields.push({
      name: "Gueltig bis",
      value: formatDiscordMessageDate(context.endedAt),
      inline: true,
    });
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`Schland DB - ${title}`)
    .setDescription(
      "Du hast eine Moderationsnachricht aus der Schland Verwaltung erhalten.",
    )
    .addFields(fields)
    .setFooter({ text: "Schland DB - Verwaltung" })
    .setTimestamp(new Date(context.startedAt));
}

async function pollAuditLogs(trigger) {
  if (auditPollRunning) {
    return;
  }

  auditPollRunning = true;

  try {
    const guild = await getGuild();
    const me = guild.members.me ?? (await guild.members.fetchMe());

    if (!me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      console.warn("Bot has no View Audit Log permission; moderation live sync is limited.");
      return;
    }

    const logs = await guild.fetchAuditLogs({ limit: 25 });

    for (const entry of logs.entries.values()) {
      await handleAuditLogEntry(entry, trigger);
    }
  } catch (error) {
    console.error(`Audit poll (${trigger}) failed`, errorMessage(error));
  } finally {
    auditPollRunning = false;
  }
}

async function delayedAuditPoll(trigger) {
  await delay(1500);
  await pollAuditLogs(trigger);
}

async function handleAuditLogEntry(entry, trigger) {
  if (!entry?.id || seenAuditLogIds.has(entry.id)) {
    return;
  }

  const createdAt = entry.createdAt ?? new Date();

  if (Date.now() - createdAt.getTime() > config.auditBackfillMs) {
    seenAuditLogIds.add(entry.id);
    return;
  }

  const executor = entry.executor;

  if (!executor || executor.bot || executor.id === client.user?.id) {
    seenAuditLogIds.add(entry.id);
    return;
  }

  const event = mapAuditLogEntry(entry);

  if (!event) {
    seenAuditLogIds.add(entry.id);
    return;
  }

  try {
    await api("/moderation-events", {
      body: {
        ...event,
        externalEventId: entry.id,
        metadata: {
          auditAction: entry.action,
          live: true,
          trigger,
          ...event.metadata,
        },
        moderatorDiscordId: executor.id,
        moderatorName: formatUser(executor),
        reason: entry.reason ?? event.reason,
        source: "discord-audit-log",
        startedAt: createdAt.toISOString(),
      },
    });
    seenAuditLogIds.add(entry.id);
  } catch (error) {
    console.error("Audit event write failed", errorMessage(error));
  }
}

function mapAuditLogEntry(entry) {
  const target = entry.target;
  const discordUserId = target?.id;

  if (!discordUserId) {
    return null;
  }

  if (entry.action === AuditLogEvent.MemberBanAdd) {
    return {
      discordUserId,
      discordUsername: formatAuditTarget(target),
      durationMode: "lifetime",
      eventType: "ban",
      lifetime: true,
      metadata: { lifetime: true },
      reason: "Discord Ban",
      status: "active",
    };
  }

  if (entry.action === AuditLogEvent.MemberBanRemove) {
    return {
      discordUserId,
      discordUsername: formatAuditTarget(target),
      eventType: "ban",
      lifetime: false,
      metadata: { lifetime: false },
      reason: "Discord Ban aufgehoben",
      status: "lifted",
    };
  }

  if (entry.action === AuditLogEvent.MemberKick) {
    return {
      discordUserId,
      discordUsername: formatAuditTarget(target),
      eventType: "kick",
      reason: "Discord Kick",
      status: "recorded",
    };
  }

  if (entry.action === AuditLogEvent.MemberDisconnect) {
    return {
      discordUserId,
      discordUsername: formatAuditTarget(target),
      eventType: "voice_disconnect",
      reason: "Discord Voice Disconnect",
      status: "recorded",
    };
  }

  if (entry.action === AuditLogEvent.MemberUpdate) {
    const timeoutChange = entry.changes?.find(
      (change) => change.key === "communication_disabled_until",
    );

    if (!timeoutChange) {
      return null;
    }

    const timeoutEnd = toIsoDate(timeoutChange.new);

    if (!timeoutEnd) {
      return {
        discordUserId,
        discordUsername: formatAuditTarget(target),
        eventType: "timeout",
        reason: "Discord Timeout aufgehoben",
        status: "lifted",
      };
    }

    const startedAt = entry.createdAt ?? new Date();
    const endedAt = new Date(timeoutEnd);
    const durationSeconds = Math.max(
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
      0,
    );

    return {
      discordUserId,
      discordUsername: formatAuditTarget(target),
      durationMode: "timed",
      durationSeconds,
      endedAt: timeoutEnd,
      eventType: "timeout",
      lifetime: false,
      metadata: { lifetime: false },
      reason: "Discord Timeout",
      status: "active",
    };
  }

  return null;
}

function memberToPayload(member) {
  return {
    discordDisplayName:
      member.displayName ?? member.user.globalName ?? member.user.username ?? member.id,
    discordUserId: member.id,
    discordUsername: formatUser(member.user),
    isBot: member.user.bot,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    roles: member.roles.cache
      .filter((role) => role.id !== member.guild.id)
      .map((role) => ({ id: role.id, name: role.name })),
  };
}

async function getGuild() {
  return client.guilds.cache.get(config.guildId) ?? client.guilds.fetch(config.guildId);
}

async function sendHeartbeat() {
  if (heartbeatRunning) {
    return;
  }

  heartbeatRunning = true;

  try {
    const guild = await getGuild();
    const stats = lastFullSyncStats ?? {
      guildMemberEstimate: guild.memberCount ?? null,
      guildName: guild.name,
      humansOnServer: null,
      skippedBots: null,
    };

    await api("/heartbeat", {
      body: {
        activeVoiceSessions: voiceSessions.size,
        disabledAnalytics: disabledAnalyticsIds.size,
        guildMemberEstimate: stats.guildMemberEstimate,
        guildName: stats.guildName ?? guild.name,
        humansOnServer: stats.humansOnServer,
        messageBufferSize: messageCounts.size,
        moderationQueueSize,
        skippedBots: stats.skippedBots,
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  } catch (error) {
    console.error("Heartbeat failed", errorMessage(error));
  } finally {
    heartbeatRunning = false;
  }
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.apiTimeoutMs);
  const method = options.method ?? "POST";

  try {
    const response = await fetch(`${config.appUrl}/api/discord-bot${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        Authorization: `Bearer ${config.syncToken}`,
        "Content-Type": "application/json",
      },
      method,
      signal: controller.signal,
    });
    const text = await response.text();
    const body = parseJson(text);

    if (!response.ok) {
      throw new Error(`${method} ${path} ${response.status}: ${body?.error ?? text}`);
    }

    return body ?? {};
  } finally {
    clearTimeout(timeout);
  }
}

async function discordApi(path, options = {}) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${config.discordBotToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok) {
    throw new Error(`Discord ${response.status}: ${body?.message ?? text}`);
  }

  return body ?? {};
}

async function shutdown(signal) {
  console.log(`Shutting down after ${signal}`);

  for (const timer of timers) {
    clearInterval(timer);
  }

  await flushMessages();

  for (const [discordUserId, session] of [...voiceSessions.entries()]) {
    await endVoiceSession(discordUserId, session);
  }

  client.destroy();
  process.exit(0);
}

function loadConfig() {
  const env = process.env;
  const required = [
    "DISCORD_BOT_TOKEN",
    "DISCORD_GUILD_ID",
    "DISCORD_INVITE_CHANNEL_ID",
    "DISCORD_BOT_SYNC_TOKEN",
    "SCHLAND_APP_URL",
  ];
  const missing = required.filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return {
    activityFlushMs: readMs(env.ACTIVITY_FLUSH_MS, 5_000),
    apiTimeoutMs: readMs(env.API_TIMEOUT_MS, 15_000),
    appUrl: env.SCHLAND_APP_URL.trim().replace(/\/+$/, ""),
    auditBackfillMs: readMs(env.AUDIT_BACKFILL_MS, 15 * 60_000),
    auditPollMs: readMs(env.AUDIT_POLL_MS, 20_000),
    discordBotToken: env.DISCORD_BOT_TOKEN.trim(),
    fullSyncIntervalMs: readMs(env.FULL_SYNC_INTERVAL_MS, 2 * 60_000),
    guildId: env.DISCORD_GUILD_ID.trim(),
    heartbeatMs: readMs(env.HEARTBEAT_MS, 10_000),
    inviteChannelId: env.DISCORD_INVITE_CHANNEL_ID.trim(),
    invitePollMs: readMs(env.INVITE_POLL_MS, 10_000),
    moderationPollMs: readMs(env.MODERATION_POLL_MS, 5_000),
    privacyRefreshMs: readMs(env.PRIVACY_REFRESH_MS, 30_000),
    syncToken: env.DISCORD_BOT_SYNC_TOKEN.trim(),
    voiceFlushMs: readMs(env.VOICE_FLUSH_MS, 60_000),
  };
}

function readMs(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 1000 ? Math.trunc(number) : fallback;
}

function isConfiguredGuild(guildId) {
  return guildId === config.guildId;
}

function formatUser(user) {
  if (!user) {
    return "Unbekannt";
  }

  if (user.discriminator && user.discriminator !== "0") {
    return `${user.username}#${user.discriminator}`;
  }

  return user.username ?? user.globalName ?? user.id ?? "Unbekannt";
}

function formatAuditTarget(target) {
  if (!target) {
    return "Unbekannt";
  }

  return formatUser(target);
}

function getModerationActionInfo(eventType) {
  const actions = {
    ban: { color: 0xb91c1c, label: "Ban" },
    kick: { color: 0xdc2626, label: "Kick" },
    timeout: { color: 0xd97706, label: "Timeout" },
    voice_disconnect: { color: 0x263f72, label: "Disconnect" },
    warn: { color: 0x92400e, label: "Warn" },
  };

  return actions[eventType] ?? null;
}

function formatModerationDirectMessageDuration(action, context) {
  if (action.eventType === "timeout" && context.durationSeconds) {
    return formatDuration(context.durationSeconds);
  }

  if (action.durationMode === "lifetime" || action.eventType === "ban") {
    return "Lifetime";
  }

  return "Einmalige Aktion";
}

function formatDuration(seconds) {
  const minutes = Math.max(Math.round(Number(seconds) / 60), 1);

  if (minutes < 60) {
    return `${minutes} Min.`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return `${hours} Std.`;
  }

  return `${Math.round(hours / 24)} Tage`;
}

function formatDiscordMessageDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function trimEmbedField(value) {
  const text = String(value || "-").trim() || "-";

  return text.length > 1024 ? `${text.slice(0, 1021)}...` : text;
}

function parseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function trimReason(reason) {
  return reason.length > 512 ? `${reason.slice(0, 509)}...` : reason;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function chunkArray(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
