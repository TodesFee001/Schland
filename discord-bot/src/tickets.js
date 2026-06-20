import { randomUUID } from "node:crypto";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";

const TICKET_OPEN_BUTTON_ID = "ticket:open";
const TICKET_TYPE_PREFIX = "ticket:type:";
const TICKET_COUNTERPART_PREFIX = "ticket:counterpart:";
const TICKET_EXCLUDED_PREFIX = "ticket:excluded:";
const TICKET_OUTSIDE_PREFIX = "ticket:outside:";
const TICKET_CHANNEL_PREFIX = "ticket:channel:";
const TICKET_TIME_PREFIX = "ticket:time:";
const TICKET_DETAILS_BUTTON_PREFIX = "ticket:details-open:";
const TICKET_DETAILS_PREFIX = "ticket:details:";
const TICKET_EXACT_BUTTON_PREFIX = "ticket:exact-open:";
const TICKET_EXACT_PREFIX = "ticket:exact:";
const TICKET_ADVICE_PREFIX = "ticket:advice:";
const TICKET_ADD_USER_PREFIX = "ticket:add-user:";
const TICKET_CLOSE_PREFIX = "ticket:close:";
const TICKET_CLOSE_SUBMIT_PREFIX = "ticket:close-submit:";
const TICKET_HELP_BUTTON_ID = "ticket:help";
const TICKET_SETUP_BUTTON_ID = "ticket:setup";
const TICKET_TRANSCRIPT_PREFIX = "ticket:transcript:";
const DEFAULT_TICKET_VIEW_ROLE_IDS = [
  "1164278939670282261",
  "1370092260842278982",
  "1164278939670282268",
];
const DEFAULT_TICKET_ADMIN_ROLE_ID = "1164278939670282268";
const TICKET_PANEL_CHANNEL_NAME = "ticket-erstellen";
const TICKET_LOG_CHANNEL_NAME = "ticket-log";
const TICKET_CATEGORY_NAME = "Tickets";
const MEMBER_IMAGE_LOG_CHANNEL_NAME = "bilder-protokoll";
const DEFAULT_TEXT_COMMAND_PREFIX = "!";
const TICKET_TYPES = {
  government_member_dispute: "Streit mit Regierungsmitglied",
  government_request: "Anfrage an die Regierung",
  member_dispute: "Streit mit Mitglied",
};
const IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_TRANSCRIPT_MESSAGES = 300;

export function createTicketSystem(input) {
  const { api, client, config, errorMessage, formatUser, getGuild } = input;
  const ticketDrafts = new Map();
  let memberImagePollRunning = false;
  let memberImageQueueSize = 0;

  return {
    getHeartbeatStats,
    handleGuildMemberAdd,
    handleInteraction,
    handleMessage,
    ensureSetup,
    pollMemberFileImages,
    startTimers,
  };

  function startTimers() {
    return [
      setInterval(
        () => void pollMemberFileImages(),
        config.memberImagePollMs,
      ),
    ];
  }

  function getHeartbeatStats() {
    cleanupDrafts();

    return {
      memberImageQueueSize,
      ticketDrafts: ticketDrafts.size,
    };
  }

  async function handleGuildMemberAdd(member) {
    if (member.user.bot) {
      return;
    }

    const joinedAt = member.joinedAt?.toISOString() ?? new Date().toISOString();
    const messageDueAt = new Date(
      new Date(joinedAt).getTime() + config.memberImageDmDelayMs,
    ).toISOString();

    try {
      const result = await api("/member-file-images", {
        body: {
          discordUserId: member.id,
          discordUsername: formatUser(member.user),
          guildId: member.guild.id,
          joinedAt,
          messageDueAt,
          metadata: {
            source: "guild_member_add",
          },
        },
      });

      await sendMemberImageLog({
        color: 0x263f72,
        description: `${member} muss ab ${formatDiscordTimestamp(
          messageDueAt,
          messageDueAt,
        )} per DM nach einem Mitgliederaktenbild gefragt werden.`,
        fields: [
          {
            name: "Request",
            value: result.request?.id ?? "unbekannt",
          },
        ],
        title: "Mitgliederaktenbild vorgemerkt",
      });
    } catch (error) {
      console.error("Member image request create failed", errorMessage(error));
    }
  }

  async function handleMessage(message) {
    if (message.author?.bot) {
      return false;
    }

    if (!message.guild) {
      await handleDirectMessage(message);
      return true;
    }

    if (await handleTextCommand(message)) {
      return true;
    }

    const ticketId = getTicketIdFromChannel(message.channel);

    if (!ticketId) {
      return false;
    }

    const evidence = buildMessageEvidence(message);

    if (evidence.length === 0) {
      return false;
    }

    try {
      await api("/tickets/evidence", {
        body: {
          channelId: message.channel.id,
          items: evidence,
          ticketId,
        },
      });
    } catch (error) {
      console.error("Ticket evidence capture failed", errorMessage(error));
    }

    return true;
  }

  async function handleInteraction(interaction) {
    if (!isTicketInteraction(interaction)) {
      return false;
    }

    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "ticket-setup") {
          await handleTicketSetup(interaction);
          return true;
        }

        if (interaction.commandName === "ticket-anleitung") {
          await handleTicketHelp(interaction);
          return true;
        }

        if (interaction.commandName === "add") {
          await handleTicketAdd(interaction);
          return true;
        }
      }

      if (interaction.isButton()) {
        await handleTicketButton(interaction);
        return true;
      }

      if (
        interaction.isStringSelectMenu() ||
        interaction.isUserSelectMenu() ||
        interaction.isChannelSelectMenu()
      ) {
        await handleTicketSelect(interaction);
        return true;
      }

      if (interaction.isModalSubmit()) {
        await handleTicketModal(interaction);
        return true;
      }
    } catch (error) {
      console.error("Ticket interaction failed", errorMessage(error));

      await replyTicketError(
        interaction,
        "Ticket-Aktion konnte gerade nicht verarbeitet werden.",
      );
      return true;
    }

    return false;
  }

  async function pollMemberFileImages() {
    if (memberImagePollRunning) {
      return;
    }

    memberImagePollRunning = true;

    try {
      const result = await api("/member-file-images", { method: "GET" });
      const due = Array.isArray(result.due) ? result.due : [];
      const overdue = Array.isArray(result.overdue) ? result.overdue : [];
      memberImageQueueSize = due.length + overdue.length;

      for (const request of due) {
        await sendMemberImageRequest(request);
      }

      for (const request of overdue) {
        await queueMemberImageWarning(request);
      }
    } catch (error) {
      console.error("Member image poll failed", errorMessage(error));
    } finally {
      memberImagePollRunning = false;
    }
  }

  async function ensureSetup() {
    if (!config.autoTicketSetup) {
      return;
    }

    const guild = await getGuild();
    const setup = await ensureTicketSetup(guild, {
      actorLabel: "Bot-Start",
      refreshPanel: true,
    });

    console.log(
      `Ticket setup ready: panel=${setup.panelChannel.id} log=${setup.logChannel.id} imageLog=${setup.imageLogChannel.id} category=${setup.category.id}`,
    );
  }

  async function handleTicketSetup(interaction) {
    if (!canManageTickets(interaction.member, interaction.memberPermissions)) {
      await interaction.reply({
        content: "Du brauchst Ticket-Adminrechte fuer das Setup.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild ?? (await getGuild());
    const setup = await ensureTicketSetup(guild, {
      actorLabel: formatUser(interaction.user),
      refreshPanel: true,
    });

    await interaction.editReply({ content: formatTicketSetupSummary(setup) });
  }

  async function handleTicketHelp(interaction) {
    await interaction.reply({
      content: buildTicketHelpText(),
      ephemeral: true,
    });
  }

  async function handleTicketSetupButton(interaction) {
    if (!canManageTickets(interaction.member, interaction.memberPermissions)) {
      await interaction.reply({
        content: "Du brauchst Ticket-Adminrechte fuer das Setup.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild ?? (await getGuild());
    const setup = await ensureTicketSetup(guild, {
      actorLabel: formatUser(interaction.user),
      refreshPanel: true,
    });

    await interaction.editReply({ content: formatTicketSetupSummary(setup) });
  }

  async function handleTextCommand(message) {
    const parsed = parseTextCommand(message.content);

    if (!parsed) {
      return false;
    }

    if (parsed.command === "ticket-setup") {
      await handleTicketSetupMessage(message);
      return true;
    }

    if (
      parsed.command === "ticket-anleitung" ||
      parsed.command === "ticket-help" ||
      parsed.command === "ticket-hilfe"
    ) {
      await message.reply(buildTicketHelpText());
      return true;
    }

    if (parsed.command === "add") {
      await handleTicketAddMessage(message, parsed.args);
      return true;
    }

    return false;
  }

  async function handleTicketSetupMessage(message) {
    if (!canManageTickets(message.member, message.member?.permissions)) {
      await message.reply("Du brauchst Ticket-Adminrechte fuer das Setup.");
      return;
    }

    const setup = await ensureTicketSetup(message.guild ?? (await getGuild()), {
      actorLabel: formatUser(message.author),
      refreshPanel: true,
    });

    await message.reply(formatTicketSetupSummary(setup));
  }

  async function handleTicketButton(interaction) {
    if (interaction.customId === TICKET_OPEN_BUTTON_ID) {
      await startTicketDraft(interaction);
      return;
    }

    if (interaction.customId === TICKET_HELP_BUTTON_ID) {
      await interaction.reply({
        content: buildTicketHelpText(),
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId === TICKET_SETUP_BUTTON_ID) {
      await handleTicketSetupButton(interaction);
      return;
    }

    if (interaction.customId.startsWith(TICKET_OUTSIDE_PREFIX)) {
      const draft = requireDraft(interaction, TICKET_OUTSIDE_PREFIX);

      if (!draft) {
        return;
      }

      draft.incidentChannelId = null;
      draft.incidentChannelName = "Ausserhalb von Discord";
      ticketDrafts.set(draft.id, draft);
      await interaction.update({
        components: buildTimeSelectRows(draft.id),
        content: buildDraftMessage(draft, "Wann ist es passiert?"),
      });
      return;
    }

    if (interaction.customId.startsWith(TICKET_ADVICE_PREFIX)) {
      await handleAdviceButton(interaction);
      return;
    }

    if (interaction.customId.startsWith(TICKET_ADD_USER_PREFIX)) {
      await showTicketAddUserSelect(interaction);
      return;
    }

    if (interaction.customId.startsWith(TICKET_DETAILS_BUTTON_PREFIX)) {
      await showTicketDetailsModal(interaction, TICKET_DETAILS_BUTTON_PREFIX);
      return;
    }

    if (interaction.customId.startsWith(TICKET_EXACT_BUTTON_PREFIX)) {
      await showTicketExactModal(interaction, TICKET_EXACT_BUTTON_PREFIX);
      return;
    }

    if (interaction.customId.startsWith(TICKET_CLOSE_PREFIX)) {
      await showCloseModal(interaction);
      return;
    }

    if (interaction.customId.startsWith(TICKET_TRANSCRIPT_PREFIX)) {
      await handleTranscriptButton(interaction);
    }
  }

  async function handleTicketSelect(interaction) {
    if (interaction.customId.startsWith(TICKET_ADD_USER_PREFIX)) {
      await addTicketUsersFromSelect(interaction);
      return;
    }

    if (interaction.customId.startsWith(TICKET_TYPE_PREFIX)) {
      const draft = requireDraft(interaction, TICKET_TYPE_PREFIX);

      if (!draft) {
        return;
      }

      draft.ticketType = interaction.values[0];
      ticketDrafts.set(draft.id, draft);
      await interaction.update({
        components: buildCounterpartRows(draft.id),
        content: buildDraftMessage(
          draft,
          "Waehle mindestens eine Gegenpartei aus.",
        ),
      });
      return;
    }

    if (interaction.customId.startsWith(TICKET_COUNTERPART_PREFIX)) {
      const draft = requireDraft(interaction, TICKET_COUNTERPART_PREFIX);

      if (!draft) {
        return;
      }

      draft.counterpartUsers = await usersFromSelect(interaction);
      draft.counterpartUsers = draft.counterpartUsers.filter(
        (user) => user.discordUserId !== interaction.user.id,
      );

      if (draft.counterpartUsers.length === 0) {
        await interaction.update({
          components: buildCounterpartRows(draft.id),
          content: buildDraftMessage(
            draft,
            "Bitte waehle mindestens eine andere Person aus.",
          ),
        });
        return;
      }

      ticketDrafts.set(draft.id, draft);

      if (draft.ticketType === "government_member_dispute") {
        await interaction.update({
          components: buildExcludedRows(draft.id),
          content: buildDraftMessage(
            draft,
            "Waehle die betroffenen Regierungsmitglieder aus. Diese Personen werden explizit aus dem Ticket ausgeschlossen.",
          ),
        });
        return;
      }

      await interaction.update({
        components: buildChannelSelectRows(draft.id),
        content: buildDraftMessage(draft, "Wo ist der Vorfall passiert?"),
      });
      return;
    }

    if (interaction.customId.startsWith(TICKET_EXCLUDED_PREFIX)) {
      const draft = requireDraft(interaction, TICKET_EXCLUDED_PREFIX);

      if (!draft) {
        return;
      }

      draft.excludedUsers = await usersFromSelect(interaction);

      if (draft.excludedUsers.length === 0) {
        await interaction.update({
          components: buildExcludedRows(draft.id),
          content: buildDraftMessage(
            draft,
            "Bei Streit mit Regierungsmitgliedern muss mindestens eine auszuschliessende Person gewaehlt werden.",
          ),
        });
        return;
      }

      const governmentError = await validateGovernmentExcludedUsers(
        interaction,
        draft.excludedUsers,
      );

      if (governmentError) {
        await interaction.update({
          components: buildExcludedRows(draft.id),
          content: buildDraftMessage(draft, governmentError),
        });
        return;
      }

      ticketDrafts.set(draft.id, draft);
      await interaction.update({
        components: buildChannelSelectRows(draft.id),
        content: buildDraftMessage(draft, "Wo ist der Vorfall passiert?"),
      });
      return;
    }

    if (interaction.customId.startsWith(TICKET_CHANNEL_PREFIX)) {
      const draft = requireDraft(interaction, TICKET_CHANNEL_PREFIX);

      if (!draft) {
        return;
      }

      const channelId = interaction.values[0];
      const channel =
        interaction.guild?.channels.cache.get(channelId) ??
        (await interaction.guild?.channels.fetch(channelId).catch(() => null));

      draft.incidentChannelId = channelId;
      draft.incidentChannelName = channel?.name ?? channelId;
      ticketDrafts.set(draft.id, draft);
      await interaction.update({
        components: buildTimeSelectRows(draft.id),
        content: buildDraftMessage(draft, "Wann ist es passiert?"),
      });
      return;
    }

    if (interaction.customId.startsWith(TICKET_TIME_PREFIX)) {
      const draft = requireDraft(interaction, TICKET_TIME_PREFIX);

      if (!draft) {
        return;
      }

      const value = interaction.values[0];

      if (value === "exact") {
        draft.incidentAt = null;
        draft.incidentTimeText = "Genauer Zeitpunkt";
        ticketDrafts.set(draft.id, draft);
        await interaction.update({
          components: [
            ...buildTimeSelectRows(draft.id),
            buildOpenDetailsButtonRow(draft.id, true),
          ],
          content: buildDraftMessage(
            draft,
            "Fast fertig: oeffne jetzt Zeit und Details.",
          ),
        });
        return;
      }

      const mappedTime = mapIncidentTime(value);
      draft.incidentAt = mappedTime.incidentAt;
      draft.incidentTimeText = mappedTime.incidentTimeText;
      ticketDrafts.set(draft.id, draft);
      await interaction.update({
        components: [
          ...buildTimeSelectRows(draft.id),
          buildOpenDetailsButtonRow(draft.id, false),
        ],
        content: buildDraftMessage(draft, "Fast fertig: oeffne jetzt die Details."),
      });
    }
  }

  async function handleTicketModal(interaction) {
    if (interaction.customId.startsWith(TICKET_DETAILS_PREFIX)) {
      const draft = requireDraft(interaction, TICKET_DETAILS_PREFIX);

      if (!draft) {
        return;
      }

      draft.description = getModalText(interaction, "description");
      draft.desiredOutcome = getModalText(interaction, "desired_outcome");
      await createTicketFromDraft(interaction, draft);
      return;
    }

    if (interaction.customId.startsWith(TICKET_EXACT_PREFIX)) {
      const draft = requireDraft(interaction, TICKET_EXACT_PREFIX);

      if (!draft) {
        return;
      }

      const exactTime = getModalText(interaction, "exact_time");
      const parsed = parseIncidentDate(exactTime);
      draft.incidentAt = parsed;
      draft.incidentTimeText = exactTime;
      draft.description = getModalText(interaction, "description");
      draft.desiredOutcome = getModalText(interaction, "desired_outcome");
      await createTicketFromDraft(interaction, draft);
      return;
    }

    if (interaction.customId.startsWith(TICKET_CLOSE_SUBMIT_PREFIX)) {
      await closeTicketFromModal(interaction);
    }
  }

  async function startTicketDraft(interaction) {
    const draft = {
      counterpartUsers: [],
      creatorDiscordUserId: interaction.user.id,
      creatorDiscordUsername: formatUser(interaction.user),
      description: "",
      desiredOutcome: "",
      excludedUsers: [],
      expiresAt: Date.now() + config.ticketDraftTtlMs,
      id: randomUUID(),
      incidentAt: null,
      incidentChannelId: null,
      incidentChannelName: null,
      incidentTimeText: null,
      ticketType: null,
    };

    cleanupDrafts();
    ticketDrafts.set(draft.id, draft);

    await interaction.reply({
      components: buildTypeSelectRows(draft.id),
      content: buildDraftMessage(draft, "Welche Ticketart passt?"),
      ephemeral: true,
    });
  }

  async function createTicketFromDraft(interaction, draft) {
    if (!draft.description?.trim()) {
      await replyTicketError(interaction, "Bitte beschreibe die Situation.");
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild ?? (await getGuild());
    const ticketResult = await api("/tickets", {
      body: {
        counterpartUsers: draft.counterpartUsers,
        creatorDiscordUserId: draft.creatorDiscordUserId,
        creatorDiscordUsername: draft.creatorDiscordUsername,
        description: draft.description,
        desiredOutcome: draft.desiredOutcome,
        excludedUsers: draft.excludedUsers,
        guildId: guild.id,
        incidentAt: draft.incidentAt,
        incidentChannelId: draft.incidentChannelId,
        incidentChannelName: draft.incidentChannelName,
        incidentTimeText: draft.incidentTimeText,
        metadata: {
          createdFrom: "discord-ticket-panel",
        },
        ticketType: draft.ticketType,
      },
    });
    const ticket = ticketResult.ticket;

    if (!ticket?.id) {
      throw new Error("Ticket wurde nicht in der App angelegt.");
    }

    const category = await ensureTicketCategory(guild);
    const channel = await guild.channels.create({
      name: buildTicketChannelName(ticket),
      parent: category.id,
      permissionOverwrites: buildTicketPermissionOverwrites(guild, draft),
      reason: trimReason(`Schland Ticket ${ticket.ticketNumber ?? ticket.id}`),
      topic: buildTicketTopic(ticket, draft),
      type: ChannelType.GuildText,
    });

    const updated = await api("/tickets", {
      body: {
        channelId: channel.id,
        channelName: channel.name,
        ticketId: ticket.id,
      },
      method: "PATCH",
    });
    const updatedTicket = updated.ticket ?? {
      ...ticket,
      channelId: channel.id,
      channelName: channel.name,
    };

    await channel.send({
      components: buildTicketChannelActionRows(ticket.id),
      embeds: [buildTicketStartEmbed(updatedTicket, draft)],
    });
    await sendTicketLog({
      color: 0x2563eb,
      description: `${interaction.user} hat ${channel} erstellt.`,
      fields: [
        { name: "Ticket", value: updatedTicket.ticketNumber ?? ticket.id },
        { name: "Typ", value: TICKET_TYPES[draft.ticketType] ?? draft.ticketType },
      ],
      title: "Ticket erstellt",
    });

    ticketDrafts.delete(draft.id);
    await interaction.editReply({
      content: `Ticket erstellt: ${channel}`,
    });
  }

  async function handleTicketAdd(interaction) {
    if (!interaction.guild || !interaction.channel) {
      await interaction.reply({
        content: "/add funktioniert nur in einem Ticket-Channel.",
        ephemeral: true,
      });
      return;
    }

    if (!hasTicketAdminRole(interaction.member)) {
      await interaction.reply({
        content: "Du brauchst die Ticket-Adminrolle fuer /add.",
        ephemeral: true,
      });
      return;
    }

    const ticketId = getTicketIdFromChannel(interaction.channel);

    if (!ticketId) {
      await interaction.reply({
        content: "/add funktioniert nur in einem aktiven Ticket-Channel.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("grund") ?? "Nachtraeglich hinzugefuegt";

    try {
      const result = await api("/tickets", {
        body: {
          action: "add_participant",
          actorDiscordUserId: interaction.user.id,
          actorDiscordUsername: formatUser(interaction.user),
          channelId: interaction.channel.id,
          reason,
          user: {
            discordUserId: user.id,
            discordUsername: formatUser(user),
          },
        },
        method: "PATCH",
      });

      await interaction.channel.permissionOverwrites.edit(
        user.id,
        buildTicketUserAllowOverwrite(),
        {
          reason: trimReason(`Schland Ticket /add: ${reason}`),
        },
      );
      await applyExcludedDenies(interaction.channel, result.ticket?.participants);

      await interaction.editReply({
        content: `${user} wurde dem Ticket hinzugefuegt.`,
      });
    } catch (error) {
      const message = errorMessage(error).includes("ticket_user_explicitly_excluded")
        ? "Diese Person wurde beim Anlegen explizit ausgeschlossen und kann nicht hinzugefuegt werden."
        : "Person konnte nicht hinzugefuegt werden.";

      await interaction.editReply({ content: message });
    }
  }

  async function handleTicketAddMessage(message, args) {
    if (!message.guild || !message.channel) {
      await message.reply(`${config.textCommandPrefix}add funktioniert nur in einem Ticket-Channel.`);
      return;
    }

    if (!hasTicketAdminRole(message.member)) {
      await message.reply(`Du brauchst die Ticket-Adminrolle fuer ${config.textCommandPrefix}add.`);
      return;
    }

    const ticketId = getTicketIdFromChannel(message.channel);

    if (!ticketId) {
      await message.reply(`${config.textCommandPrefix}add funktioniert nur in einem aktiven Ticket-Channel.`);
      return;
    }

    const user = await resolveCommandUser(message, args[0]);

    if (!user) {
      await message.reply(`Bitte nutze: \`${config.textCommandPrefix}add @User optionaler Grund\``);
      return;
    }

    const reason =
      args
        .slice(1)
        .join(" ")
        .trim() || "Nachtraeglich hinzugefuegt";

    try {
      const result = await api("/tickets", {
        body: {
          action: "add_participant",
          actorDiscordUserId: message.author.id,
          actorDiscordUsername: formatUser(message.author),
          channelId: message.channel.id,
          reason,
          user: {
            discordUserId: user.id,
            discordUsername: formatUser(user),
          },
        },
        method: "PATCH",
      });

      await message.channel.permissionOverwrites.edit(
        user.id,
        buildTicketUserAllowOverwrite(),
        {
          reason: trimReason(`Schland Ticket ${config.textCommandPrefix}add: ${reason}`),
        },
      );
      await applyExcludedDenies(message.channel, result.ticket?.participants);

      await message.reply(`${user} wurde dem Ticket hinzugefuegt.`);
    } catch (error) {
      const reply = errorMessage(error).includes("ticket_user_explicitly_excluded")
        ? "Diese Person wurde beim Anlegen explizit ausgeschlossen und kann nicht hinzugefuegt werden."
        : "Person konnte nicht hinzugefuegt werden.";

      await message.reply(reply);
    }
  }

  async function showTicketAddUserSelect(interaction) {
    if (!hasTicketAdminRole(interaction.member)) {
      await interaction.reply({
        content: "Du brauchst die Ticket-Adminrolle, um Personen hinzuzufuegen.",
        ephemeral: true,
      });
      return;
    }

    const ticketId = interaction.customId.slice(TICKET_ADD_USER_PREFIX.length);

    if (!ticketId || ticketId !== getTicketIdFromChannel(interaction.channel)) {
      await interaction.reply({
        content: "Personen koennen nur in einem aktiven Ticket-Channel hinzugefuegt werden.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      components: buildTicketAddUserRows(ticketId),
      content: "Waehle eine oder mehrere Personen aus, die Zugriff auf dieses Ticket bekommen sollen.",
      ephemeral: true,
    });
  }

  async function showTicketDetailsModal(interaction, prefix) {
    const draft = requireDraft(interaction, prefix);

    if (!draft) {
      return;
    }

    await interaction.showModal(buildTicketDetailsModal(draft.id));
  }

  async function showTicketExactModal(interaction, prefix) {
    const draft = requireDraft(interaction, prefix);

    if (!draft) {
      return;
    }

    await interaction.showModal(buildTicketExactModal(draft.id));
  }

  async function addTicketUsersFromSelect(interaction) {
    if (!hasTicketAdminRole(interaction.member)) {
      await interaction.reply({
        content: "Du brauchst die Ticket-Adminrolle, um Personen hinzuzufuegen.",
        ephemeral: true,
      });
      return;
    }

    const ticketId = interaction.customId.slice(TICKET_ADD_USER_PREFIX.length);

    if (!ticketId || ticketId !== getTicketIdFromChannel(interaction.channel)) {
      await interaction.reply({
        content: "Diese Auswahl gehoert nicht mehr zu diesem Ticket.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    const users = await usersFromSelect(interaction);
    const added = [];
    const blocked = [];
    const failed = [];

    for (const user of users) {
      try {
        const result = await api("/tickets", {
          body: {
            action: "add_participant",
            actorDiscordUserId: interaction.user.id,
            actorDiscordUsername: formatUser(interaction.user),
            channelId: interaction.channel.id,
            reason: "Per Ticket-Button hinzugefuegt",
            user,
          },
          method: "PATCH",
        });

        await interaction.channel.permissionOverwrites.edit(
          user.discordUserId,
          buildTicketUserAllowOverwrite(),
          {
            reason: "Schland Ticket Button: Person hinzugefuegt",
          },
        );
        await applyExcludedDenies(interaction.channel, result.ticket?.participants);
        added.push(`<@${user.discordUserId}>`);
      } catch (error) {
        const name = user.discordUsername ?? user.discordUserId;

        if (errorMessage(error).includes("ticket_user_explicitly_excluded")) {
          blocked.push(name);
        } else {
          failed.push(name);
        }
      }
    }

    const lines = [];

    if (added.length > 0) {
      lines.push(`Hinzugefuegt: ${added.join(", ")}`);
    }

    if (blocked.length > 0) {
      lines.push(`Explizit ausgeschlossen, daher blockiert: ${blocked.join(", ")}`);
    }

    if (failed.length > 0) {
      lines.push(`Fehlgeschlagen: ${failed.join(", ")}`);
    }

    await interaction.editReply({
      components: [],
      content: lines.join("\n") || "Keine Person ausgewaehlt.",
    });
  }

  async function handleAdviceButton(interaction) {
    const ticketId = interaction.customId.slice(TICKET_ADVICE_PREFIX.length);

    if (!canManageTickets(interaction.member, interaction.memberPermissions)) {
      await interaction.reply({
        content: "Nur berechtigte Moderation darf den Sanktionsberater starten.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await api("/tickets/advice", {
      body: {
        actorDiscordUserId: interaction.user.id,
        actorDiscordUsername: formatUser(interaction.user),
        ticketId,
      },
    });
    const caseIds = Array.isArray(result.adviceCaseIds) ? result.adviceCaseIds : [];

    await interaction.editReply({
      content:
        caseIds.length > 0
          ? `Sanktionsberater ausgewertet. Faelle: ${caseIds.join(", ")}`
          : "Sanktionsberater ausgewertet.",
    });

    await interaction.channel?.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0f766e)
          .setTitle("KI-Sanktionsberater bereit")
          .setDescription(
            "Die KI hat eine Beratung erstellt. Sanktionen werden weiterhin nur durch berechtigte Menschen in der App ausgefuehrt.",
          )
          .addFields({
            name: "Beratungsfaelle",
            value: caseIds.join("\n") || "In der App pruefen",
          })
          .setTimestamp(new Date()),
      ],
    });
  }

  async function handleTranscriptButton(interaction) {
    if (!canManageTickets(interaction.member, interaction.memberPermissions)) {
      await interaction.reply({
        content: "Nur berechtigte Moderation darf ein Transcript sichern.",
        ephemeral: true,
      });
      return;
    }

    const ticketId = interaction.customId.slice(TICKET_TRANSCRIPT_PREFIX.length);

    await interaction.deferReply({ ephemeral: true });
    await saveTranscript(interaction.channel, ticketId, interaction.user);
    await interaction.editReply({ content: "Transcript wurde als Beleg gespeichert." });
  }

  async function showCloseModal(interaction) {
    if (!canManageTickets(interaction.member, interaction.memberPermissions)) {
      await interaction.reply({
        content: "Nur berechtigte Moderation darf Tickets schliessen.",
        ephemeral: true,
      });
      return;
    }

    const ticketId = interaction.customId.slice(TICKET_CLOSE_PREFIX.length);
    const modal = new ModalBuilder()
      .setCustomId(`${TICKET_CLOSE_SUBMIT_PREFIX}${ticketId}`)
      .setTitle("Ticket schliessen");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Grund")
          .setMaxLength(500)
          .setPlaceholder("Kurz begruenden")
          .setRequired(false)
          .setStyle(TextInputStyle.Paragraph),
      ),
    );

    await interaction.showModal(modal);
  }

  async function closeTicketFromModal(interaction) {
    const ticketId = interaction.customId.slice(TICKET_CLOSE_SUBMIT_PREFIX.length);
    const reason = getModalText(interaction, "reason") || "Ticket geschlossen";

    await interaction.deferReply({ ephemeral: true });
    await saveTranscript(interaction.channel, ticketId, interaction.user).catch((error) => {
      console.error("Ticket transcript on close failed", errorMessage(error));
    });
    await api("/tickets", {
      body: {
        action: "close",
        actorDiscordUserId: interaction.user.id,
        actorDiscordUsername: formatUser(interaction.user),
        reason,
        ticketId,
      },
      method: "PATCH",
    });

    if (interaction.channel?.setName) {
      await interaction.channel
        .setName(`closed-${interaction.channel.name}`.slice(0, 100), reason)
        .catch(() => {});
    }

    await interaction.channel?.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6b7280)
          .setTitle("Ticket geschlossen")
          .setDescription(reason)
          .setFooter({ text: `Geschlossen von ${formatUser(interaction.user)}` })
          .setTimestamp(new Date()),
      ],
    });
    await interaction.editReply({ content: "Ticket geschlossen." });
  }

  async function handleDirectMessage(message) {
    try {
      const result = await api(
        `/member-file-images?discordUserId=${encodeURIComponent(message.author.id)}`,
        { method: "GET" },
      );
      const request = result.request;

      if (!request?.id) {
        return;
      }

      const attachments = [...message.attachments.values()];
      const imageAttachments = attachments.filter((attachment) =>
        isImageAttachment(attachment),
      );

      if (attachments.length !== 1 || imageAttachments.length !== 1) {
        await api("/member-file-images", {
          body: {
            action: "invalid_response",
            details: {
              attachmentCount: attachments.length,
              imageAttachmentCount: imageAttachments.length,
              reason: "exactly_one_image_required",
            },
            discordUserId: message.author.id,
            guildId: config.guildId,
            messageId: message.id,
          },
          method: "PATCH",
        });
        await message.reply(
          "Bitte sende genau ein Bild als Anhang. Die 48-Stunden-Frist laeuft weiter.",
        );
        await sendMemberImageLog({
          color: 0xd97706,
          description: `${message.author} hat keine gueltige Einzelbild-Antwort gesendet.`,
          title: "Mitgliederaktenbild ungueltig",
        });
        return;
      }

      const attachment = imageAttachments[0];
      const submission = await api("/member-file-images/submissions", {
        body: {
          attachmentUrl: attachment.url,
          contentType: attachment.contentType,
          discordUserId: message.author.id,
          filename: attachment.name,
          guildId: config.guildId,
          messageId: message.id,
          requestId: request.id,
          size: attachment.size,
        },
      });
      await message.reply("Danke, dein Bild wurde in der Mitgliederakte gespeichert.");
      await sendMemberImageLog({
        color: 0x15803d,
        description: `${message.author} hat ein Mitgliederaktenbild eingereicht.`,
        fields: [
          { name: "Request", value: request.id },
          { name: "Datei", value: submission.file?.id ?? "gespeichert" },
        ],
        title: "Mitgliederaktenbild gespeichert",
      });
    } catch (error) {
      console.error("Member image DM handling failed", errorMessage(error));
      await message.reply(
        "Dein Bild konnte gerade nicht in der Mitgliederakte gespeichert werden. Es wurde protokolliert; bitte sende das Bild gleich nochmal oder melde dich beim Team.",
      ).catch(() => {});
      await sendMemberImageLog({
        color: 0xb91c1c,
        description: `${message.author} hat ein Bild gesendet, aber die Speicherung ist fehlgeschlagen: ${errorMessage(error)}`,
        title: "Mitgliederaktenbild Speicherfehler",
      });
    }
  }

  async function sendMemberImageRequest(request) {
    try {
      const user = await client.users.fetch(request.discordUserId);
      const messageSentAt = new Date().toISOString();
      const deadlineAt = new Date(
        new Date(messageSentAt).getTime() + config.memberImageDeadlineMs,
      ).toISOString();
      const message = await user.send({
        embeds: [buildMemberImageRequestEmbed(deadlineAt)],
      });

      await api("/member-file-images", {
        body: {
          action: "message_sent",
          deadlineAt,
          messageId: message.id,
          messageSentAt,
          requestId: request.id,
        },
        method: "PATCH",
      });
      await sendMemberImageLog({
        color: 0x2563eb,
        description: `DM an <@${request.discordUserId}> gesendet. Deadline: ${formatDiscordTimestamp(deadlineAt, deadlineAt)}.`,
        fields: [{ name: "Request", value: request.id }],
        title: "Mitgliederaktenbild angefordert",
      });
    } catch (error) {
      await api("/member-file-images", {
        body: {
          action: "dm_failed",
          error: errorMessage(error),
          requestId: request.id,
        },
        method: "PATCH",
      }).catch((updateError) => {
        console.error("Member image DM failure update failed", errorMessage(updateError));
      });
      await sendMemberImageLog({
        color: 0xb91c1c,
        description: `DM an <@${request.discordUserId}> fehlgeschlagen: ${errorMessage(error)}`,
        fields: [{ name: "Request", value: request.id }],
        title: "Mitgliederaktenbild DM fehlgeschlagen",
      });
    }
  }

  async function queueMemberImageWarning(request) {
    try {
      const result = await api("/member-file-images", {
        body: {
          action: "mark_overdue",
          requestId: request.id,
        },
        method: "PATCH",
      });

      await sendMemberImageLog({
        color: 0x92400e,
        description: `<@${request.discordUserId}> hat kein Bild fristgerecht eingereicht. Warnung wurde in die Moderationsqueue gelegt.`,
        fields: [
          { name: "Request", value: request.id },
          { name: "Moderations-Event", value: result.warningEventId ?? "nicht erstellt" },
        ],
        title: "Mitgliederaktenbild ueberfaellig",
      });
    } catch (error) {
      console.error("Member image overdue handling failed", errorMessage(error));
    }
  }

  async function saveTranscript(channel, ticketId, actor) {
    if (!channel?.messages?.fetch) {
      return;
    }

    const messages = await fetchTranscriptMessages(channel);
    const content = messages
      .map((message) => {
        const attachments = [...message.attachments.values()]
          .map((attachment) => attachment.url)
          .join(" ");

        return [
          `[${message.createdAt.toISOString()}]`,
          `${formatUser(message.author)} (${message.author.id}):`,
          message.content || "",
          attachments,
        ]
          .filter(Boolean)
          .join(" ");
      })
      .join("\n");

    await api("/tickets/evidence", {
      body: {
        content: content.slice(0, 180_000),
        evidenceType: "transcript",
        metadata: {
          capturedBy: actor.id,
          capturedByName: formatUser(actor),
          messageCount: messages.length,
        },
        ticketId,
      },
    });
  }

  async function fetchTranscriptMessages(channel) {
    const messages = [];
    let before;

    while (messages.length < MAX_TRANSCRIPT_MESSAGES) {
      const page = await channel.messages.fetch({
        before,
        limit: Math.min(100, MAX_TRANSCRIPT_MESSAGES - messages.length),
      });

      if (page.size === 0) {
        break;
      }

      messages.push(...page.values());
      before = page.last()?.id;
    }

    return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  }

  async function ensureTicketCategory(guild) {
    const existingById = config.ticketCategoryId
      ? await guild.channels.fetch(config.ticketCategoryId).catch(() => null)
      : null;

    if (existingById?.type === ChannelType.GuildCategory) {
      return existingById;
    }

    const existing = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        channel.name.toLowerCase() === TICKET_CATEGORY_NAME.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    return guild.channels.create({
      name: TICKET_CATEGORY_NAME,
      reason: "Schland Ticket-System Setup",
      type: ChannelType.GuildCategory,
    });
  }

  async function ensureTicketSetup(guild, options = {}) {
    await guild.channels.fetch().catch(() => null);

    const category = await ensureTicketCategory(guild);
    const panelChannel = await ensureTextChannel(
      guild,
      config.ticketPanelChannelId,
      TICKET_PANEL_CHANNEL_NAME,
      category.id,
    );
    const logChannel = await ensureTextChannel(
      guild,
      config.ticketLogChannelId,
      TICKET_LOG_CHANNEL_NAME,
      category.id,
    );
    const imageLogChannel = await ensureTextChannel(
      guild,
      config.memberImageLogChannelId,
      MEMBER_IMAGE_LOG_CHANNEL_NAME,
      category.id,
    );

    if (options.refreshPanel) {
      await ensureTicketPanelMessage(panelChannel);
    }

    return {
      category,
      imageLogChannel,
      logChannel,
      panelChannel,
    };
  }

  async function ensureTextChannel(guild, channelId, name, parentId) {
    const existingById = channelId
      ? await guild.channels.fetch(channelId).catch(() => null)
      : null;

    if (existingById?.type === ChannelType.GuildText) {
      await ensureTextChannelParent(existingById, parentId);
      return existingById;
    }

    const existing = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        channel.name.toLowerCase() === name.toLowerCase(),
    );

    if (existing) {
      await ensureTextChannelParent(existing, parentId);
      return existing;
    }

    return guild.channels.create({
      name,
      parent: parentId ?? undefined,
      reason: "Schland Ticket-System Setup",
      type: ChannelType.GuildText,
    });
  }

  async function ensureTextChannelParent(channel, parentId) {
    if (!parentId || channel.parentId === parentId) {
      return;
    }

    await channel.setParent(parentId, {
      lockPermissions: false,
      reason: "Schland Ticket-System Setup",
    });
  }

  async function ensureTicketPanelMessage(panelChannel) {
    const existing = await findExistingTicketPanelMessage(panelChannel);
    const payload = {
      components: buildTicketPanelActionRows(),
      embeds: [buildTicketPanelEmbed()],
    };

    if (existing) {
      await existing.edit(payload);
      return existing;
    }

    return panelChannel.send(payload);
  }

  async function findExistingTicketPanelMessage(panelChannel) {
    const messages = await panelChannel.messages
      .fetch({ limit: 25 })
      .catch(() => null);

    if (!messages) {
      return null;
    }

    return (
      messages.find((message) => {
        if (message.author?.id !== client.user?.id) {
          return false;
        }

        return message.components?.some((row) =>
          row.components?.some(
            (component) => component.customId === TICKET_OPEN_BUTTON_ID,
          ),
        );
      }) ?? null
    );
  }

  async function getTicketLogChannel() {
    const guild = await getGuild();

    return findTextChannel(
      guild,
      config.ticketLogChannelId,
      TICKET_LOG_CHANNEL_NAME,
    );
  }

  async function getMemberImageLogChannel() {
    const guild = await getGuild();

    return findTextChannel(
      guild,
      config.memberImageLogChannelId,
      MEMBER_IMAGE_LOG_CHANNEL_NAME,
    );
  }

  async function findTextChannel(guild, channelId, name) {
    const byId = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;

    if (byId?.type === ChannelType.GuildText) {
      return byId;
    }

    return (
      guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.name.toLowerCase() === name.toLowerCase(),
      ) ?? null
    );
  }

  async function sendTicketLog(input) {
    const channel = await getTicketLogChannel();

    if (!channel) {
      return;
    }

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(input.color)
          .setTitle(input.title)
          .setDescription(input.description)
          .addFields(input.fields ?? [])
          .setTimestamp(new Date()),
      ],
    });
  }

  async function sendMemberImageLog(input) {
    const channel = await getMemberImageLogChannel();

    if (!channel) {
      return;
    }

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(input.color)
          .setTitle(input.title)
          .setDescription(input.description)
          .addFields(input.fields ?? [])
          .setTimestamp(new Date()),
      ],
    });
  }

  function requireDraft(interaction, prefix) {
    const draftId = interaction.customId.slice(prefix.length);
    const draft = ticketDrafts.get(draftId);

    if (!draft || draft.expiresAt < Date.now()) {
      ticketDrafts.delete(draftId);
      void replyTicketError(
        interaction,
        "Dieser Ticketentwurf ist abgelaufen. Bitte starte neu.",
      );
      return null;
    }

    if (draft.creatorDiscordUserId !== interaction.user.id) {
      void replyTicketError(interaction, "Das ist nicht dein Ticketentwurf.");
      return null;
    }

    return draft;
  }

  function cleanupDrafts() {
    const now = Date.now();

    for (const [id, draft] of ticketDrafts.entries()) {
      if (draft.expiresAt < now) {
        ticketDrafts.delete(id);
      }
    }
  }

  function buildTypeSelectRows(draftId) {
    return [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${TICKET_TYPE_PREFIX}${draftId}`)
          .setPlaceholder("Ticketart auswaehlen")
          .addOptions(
            {
              label: TICKET_TYPES.government_request,
              value: "government_request",
            },
            {
              label: TICKET_TYPES.member_dispute,
              value: "member_dispute",
            },
            {
              label: TICKET_TYPES.government_member_dispute,
              value: "government_member_dispute",
            },
          ),
      ),
    ];
  }

  function buildCounterpartRows(draftId) {
    return [
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`${TICKET_COUNTERPART_PREFIX}${draftId}`)
          .setMaxValues(5)
          .setMinValues(1)
          .setPlaceholder("Gegenpartei auswaehlen"),
      ),
    ];
  }

  function buildExcludedRows(draftId) {
    return [
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`${TICKET_EXCLUDED_PREFIX}${draftId}`)
          .setMaxValues(5)
          .setMinValues(1)
          .setPlaceholder("Regierungsmitglied ausschliessen"),
      ),
    ];
  }

  function buildChannelSelectRows(draftId) {
    return [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setChannelTypes(
            ChannelType.GuildAnnouncement,
            ChannelType.GuildText,
            ChannelType.PrivateThread,
            ChannelType.PublicThread,
          )
          .setCustomId(`${TICKET_CHANNEL_PREFIX}${draftId}`)
          .setMaxValues(1)
          .setMinValues(1)
          .setPlaceholder("Discord-Channel auswaehlen"),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${TICKET_OUTSIDE_PREFIX}${draftId}`)
          .setLabel("Ausserhalb von Discord")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  function buildTimeSelectRows(draftId) {
    return [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${TICKET_TIME_PREFIX}${draftId}`)
          .setPlaceholder("Zeitpunkt auswaehlen")
          .addOptions(
            { label: "Gerade eben", value: "now" },
            { label: "Heute", value: "today" },
            { label: "Gestern", value: "yesterday" },
            { label: "Genauer Zeitpunkt", value: "exact" },
          ),
      ),
    ];
  }

  function buildOpenDetailsButtonRow(draftId, exactTime) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `${exactTime ? TICKET_EXACT_BUTTON_PREFIX : TICKET_DETAILS_BUTTON_PREFIX}${draftId}`,
        )
        .setLabel(exactTime ? "Zeit und Details eingeben" : "Details eingeben")
        .setStyle(ButtonStyle.Primary),
    );
  }

  function buildTicketDetailsModal(draftId) {
    const modal = new ModalBuilder()
      .setCustomId(`${TICKET_DETAILS_PREFIX}${draftId}`)
      .setTitle("Ticketdetails");

    modal.addComponents(
      buildTextInputRow("description", "Was ist passiert?", {
        maxLength: 1200,
        placeholder: "Kurz und konkret beschreiben",
        required: true,
        style: TextInputStyle.Paragraph,
      }),
      buildTextInputRow("desired_outcome", "Gewuenschter Ausgang", {
        maxLength: 500,
        placeholder: "optional",
        required: false,
        style: TextInputStyle.Paragraph,
      }),
    );

    return modal;
  }

  function buildTicketExactModal(draftId) {
    const modal = new ModalBuilder()
      .setCustomId(`${TICKET_EXACT_PREFIX}${draftId}`)
      .setTitle("Ticketdetails");

    modal.addComponents(
      buildTextInputRow("exact_time", "Datum und Uhrzeit", {
        maxLength: 80,
        placeholder: "08.06.2026 23:36",
        required: true,
        style: TextInputStyle.Short,
      }),
      buildTextInputRow("description", "Was ist passiert?", {
        maxLength: 1200,
        placeholder: "Kurz und konkret beschreiben",
        required: true,
        style: TextInputStyle.Paragraph,
      }),
      buildTextInputRow("desired_outcome", "Gewuenschter Ausgang", {
        maxLength: 500,
        placeholder: "optional",
        required: false,
        style: TextInputStyle.Paragraph,
      }),
    );

    return modal;
  }

  function buildTicketPanelActionRows() {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(TICKET_OPEN_BUTTON_ID)
          .setLabel("Ticket erstellen")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(TICKET_HELP_BUTTON_ID)
          .setLabel("Anleitung")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(TICKET_SETUP_BUTTON_ID)
          .setLabel("Setup reparieren")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  function buildTicketChannelActionRows(ticketId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${TICKET_ADD_USER_PREFIX}${ticketId}`)
          .setLabel("Person hinzufuegen")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${TICKET_ADVICE_PREFIX}${ticketId}`)
          .setLabel("Sanktionsberater auswerten")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${TICKET_TRANSCRIPT_PREFIX}${ticketId}`)
          .setLabel("Transcript sichern")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${TICKET_CLOSE_PREFIX}${ticketId}`)
          .setLabel("Ticket schliessen")
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }

  function buildTicketAddUserRows(ticketId) {
    return [
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`${TICKET_ADD_USER_PREFIX}${ticketId}`)
          .setMaxValues(5)
          .setMinValues(1)
          .setPlaceholder("Personen fuer dieses Ticket auswaehlen"),
      ),
    ];
  }

  function buildTextInputRow(customId, label, options) {
    return new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setMaxLength(options.maxLength)
        .setPlaceholder(options.placeholder)
        .setRequired(options.required)
        .setStyle(options.style),
    );
  }

  function buildTicketPanelEmbed() {
    return new EmbedBuilder()
      .setColor(0x2563eb)
      .setTitle("Schland Ticket-System")
      .setDescription(
        "Erstelle hier ein privates Ticket ueber Buttons und Auswahlfelder. Die Anleitung erklaert den Ablauf; Setup reparieren ist nur fuer berechtigte Admins.",
      )
      .setFooter({ text: "Schland DB - Ticketpanel" })
      .setTimestamp(new Date());
  }

  function buildTicketStartEmbed(ticket, draft) {
    return new EmbedBuilder()
      .setColor(0x2563eb)
      .setTitle(`${ticket.ticketNumber ?? "Ticket"} - ${TICKET_TYPES[draft.ticketType]}`)
      .setDescription(draft.description)
      .addFields(
        {
          name: "Ersteller",
          value: `<@${draft.creatorDiscordUserId}>`,
          inline: true,
        },
        {
          name: "Gegenpartei",
          value:
            draft.counterpartUsers
              .map((user) => `<@${user.discordUserId}>`)
              .join(", ") || "-",
          inline: true,
        },
        {
          name: "Ausgeschlossen",
          value:
            draft.excludedUsers
              .map((user) => `<@${user.discordUserId}>`)
              .join(", ") || "-",
          inline: true,
        },
        {
          name: "Ort",
          value: draft.incidentChannelId
            ? `<#${draft.incidentChannelId}>`
            : draft.incidentChannelName ?? "-",
          inline: true,
        },
        {
          name: "Zeitpunkt",
          value: draft.incidentTimeText ?? "-",
          inline: true,
        },
        {
          name: "Gewuenschter Ausgang",
          value: trimEmbedField(draft.desiredOutcome || "-"),
          inline: false,
        },
      )
      .setFooter({
        text: "Sanktionsberater ist nur Beratung; Umsetzung bleibt Admin-Klick.",
      })
      .setTimestamp(new Date());
  }

  function buildMemberImageRequestEmbed(deadlineAt) {
    return new EmbedBuilder()
      .setColor(0x2563eb)
      .setTitle("Mitgliederaktenbild benoetigt")
      .setDescription(
        "Bitte antworte auf diese DM mit genau einem Bild als Anhang. Andere Antworten werden protokolliert; die Frist laeuft weiter.",
      )
      .addFields({
        name: "Frist",
        value: formatDiscordTimestamp(deadlineAt, deadlineAt),
      })
      .setFooter({ text: "Schland DB - Mitgliederakte" })
      .setTimestamp(new Date());
  }

  function buildDraftMessage(draft, prompt) {
    const lines = [
      prompt,
      "",
      `Typ: ${draft.ticketType ? TICKET_TYPES[draft.ticketType] : "-"}`,
      `Gegenpartei: ${
        draft.counterpartUsers.map((user) => `<@${user.discordUserId}>`).join(", ") ||
        "-"
      }`,
      `Ausgeschlossen: ${
        draft.excludedUsers.map((user) => `<@${user.discordUserId}>`).join(", ") ||
        "-"
      }`,
      `Ort: ${
        draft.incidentChannelId
          ? `<#${draft.incidentChannelId}>`
          : draft.incidentChannelName ?? "-"
      }`,
      `Zeit: ${draft.incidentTimeText ?? "-"}`,
    ];

    return lines.join("\n");
  }

  function buildTicketPermissionOverwrites(guild, draft) {
    const roleOverwrites = config.ticketViewRoleIds.map((roleId) => ({
      allow: buildTicketRoleAllowOverwrite(),
      id: roleId,
      type: 0,
    }));
    const creatorOverwrite = {
      allow: buildTicketUserAllowOverwrite(),
      id: draft.creatorDiscordUserId,
      type: 1,
    };
    const excludedOverwrites = draft.excludedUsers.map((user) => ({
      deny: [PermissionFlagsBits.ViewChannel],
      id: user.discordUserId,
      type: 1,
    }));

    return [
      {
        deny: [PermissionFlagsBits.ViewChannel],
        id: guild.id,
        type: 0,
      },
      ...roleOverwrites,
      creatorOverwrite,
      ...excludedOverwrites,
    ];
  }

  function buildTicketRoleAllowOverwrite() {
    return [
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ViewChannel,
    ];
  }

  function buildTicketUserAllowOverwrite() {
    return {
      AttachFiles: true,
      EmbedLinks: true,
      ReadMessageHistory: true,
      SendMessages: true,
      ViewChannel: true,
    };
  }

  async function applyExcludedDenies(channel, participants) {
    const excluded = Array.isArray(participants)
      ? participants.filter((participant) => participant.excludedFromTicket)
      : [];

    for (const participant of excluded) {
      if (!participant.discordUserId) {
        continue;
      }

      await channel.permissionOverwrites.edit(
        participant.discordUserId,
        { ViewChannel: false },
        {
          reason: "Schland Ticket: explizit ausgeschlossen",
        },
      );
    }
  }

  function buildTicketTopic(ticket, draft) {
    return [
      "Schland Ticket",
      `ticketId=${ticket.id}`,
      `ticketNumber=${ticket.ticketNumber ?? "-"}`,
      `creator=${draft.creatorDiscordUserId}`,
      `type=${draft.ticketType}`,
    ].join(" | ");
  }

  function buildTicketChannelName(ticket) {
    return `ticket-${ticket.ticketNumber ?? ticket.id}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 90);
  }

  function getTicketIdFromChannel(channel) {
    const topic = channel?.topic ?? "";
    const match = topic.match(/ticketId=([0-9a-f-]{36})/i);

    return match?.[1] ?? null;
  }

  async function usersFromSelect(interaction) {
    const users = [];

    for (const id of interaction.values) {
      const user =
        interaction.users.get(id) ?? (await client.users.fetch(id).catch(() => null));

      if (!user) {
        continue;
      }

      users.push({
        discordUserId: user.id,
        discordUsername: formatUser(user),
      });
    }

    return users;
  }

  async function validateGovernmentExcludedUsers(interaction, users) {
    if (config.governmentRoleIds.length === 0) {
      return null;
    }

    const invalid = [];

    for (const user of users) {
      const member = await interaction.guild?.members
        .fetch(user.discordUserId)
        .catch(() => null);
      const hasGovernmentRole = member?.roles.cache.some((role) =>
        config.governmentRoleIds.includes(role.id),
      );

      if (!hasGovernmentRole) {
        invalid.push(user.discordUsername ?? user.discordUserId);
      }
    }

    return invalid.length > 0
      ? `Diese Auswahl ist nicht als Regierungsrolle erkannt: ${invalid.join(", ")}`
      : null;
  }

  function mapIncidentTime(value) {
    if (value === "now") {
      return {
        incidentAt: new Date().toISOString(),
        incidentTimeText: "Gerade eben",
      };
    }

    if (value === "yesterday") {
      return {
        incidentAt: null,
        incidentTimeText: "Gestern (ungefaehr)",
      };
    }

    return {
      incidentAt: null,
      incidentTimeText: "Heute (ungefaehr)",
    };
  }

  function parseIncidentDate(value) {
    const text = String(value ?? "").trim();
    const match = text.match(
      /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/,
    );

    if (!match) {
      const date = new Date(text);

      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    const [, day, month, year, hour = "0", minute = "0"] = match;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function buildMessageEvidence(message) {
    const items = [];
    const content = message.content?.trim();

    if (content) {
      items.push({
        authorDiscordUserId: message.author.id,
        authorDiscordUsername: formatUser(message.author),
        content,
        discordMessageId: message.id,
        evidenceType: "message",
        externalUrl: message.url,
        metadata: {
          channelId: message.channel.id,
        },
      });
    }

    for (const attachment of message.attachments.values()) {
      items.push({
        attachmentContentType: attachment.contentType,
        attachmentFilename: attachment.name,
        attachmentSize: attachment.size,
        authorDiscordUserId: message.author.id,
        authorDiscordUsername: formatUser(message.author),
        discordMessageId: message.id,
        evidenceType: isImageAttachment(attachment) ? "screenshot" : "file",
        externalUrl: attachment.url,
        metadata: {
          channelId: message.channel.id,
        },
      });
    }

    return items;
  }

  function isImageAttachment(attachment) {
    const contentType = attachment.contentType?.split(";")[0]?.toLowerCase();

    if (contentType && IMAGE_CONTENT_TYPES.has(contentType)) {
      return true;
    }

    return /\.(avif|gif|hei[cf]|jpe?g|png|webp)$/i.test(
      attachment.name ?? attachment.url ?? "",
    );
  }

  async function resolveCommandUser(message, rawUser) {
    const mentioned = message.mentions.users.first();

    if (mentioned) {
      return mentioned;
    }

    const match = String(rawUser ?? "").match(/^<@!?(\d{15,25})>$|^(\d{15,25})$/);
    const userId = match?.[1] ?? match?.[2];

    if (!userId) {
      return null;
    }

    return client.users.fetch(userId).catch(() => null);
  }

  function parseTextCommand(content) {
    const prefix = config.textCommandPrefix || DEFAULT_TEXT_COMMAND_PREFIX;
    const text = String(content ?? "").trim();

    if (!text.toLowerCase().startsWith(prefix.toLowerCase())) {
      return null;
    }

    const body = text.slice(prefix.length).trim();

    if (!body) {
      return null;
    }

    const [rawCommand, ...args] = body.split(/\s+/);
    const command = rawCommand.toLowerCase();

    if (command === "ticket" && args[0]?.toLowerCase() === "setup") {
      return { args: args.slice(1), command: "ticket-setup" };
    }

    return { args, command };
  }

  function buildTicketHelpText() {
    return [
      "**Schland Ticket-System**",
      "1. Ticket starten: im Kanal `#ticket-erstellen` auf den Button `Ticket erstellen` klicken.",
      "2. Ticketart, Gegenpartei, Ort, Zeitpunkt und Details auswaehlen.",
      "3. Der Bot erstellt einen privaten Ticketchannel mit Belegspeicherung.",
      "4. Im Ticket koennen Berechtigte per Button Personen hinzufuegen, den Sanktionsberater starten, Transcript sichern oder schliessen.",
      "",
      `Text-Fallback, falls Discord keine Slash-Commands zeigt: \`${config.textCommandPrefix}ticket-setup\`, \`${config.textCommandPrefix}ticket-anleitung\`, \`${config.textCommandPrefix}add <Person> Grund\`.`,
      "Slash-Variante: `/ticket-setup`, `/ticket-anleitung`, `/add user grund?`.",
    ].join("\n");
  }

  function formatTicketSetupSummary(setup) {
    return [
      "Ticket-Setup aktualisiert.",
      `Panel: ${setup.panelChannel}`,
      `Ticket-Log: ${setup.logChannel}`,
      `Bilder-Protokoll: ${setup.imageLogChannel}`,
      `Kategorie: ${setup.category.name} (${setup.category.id})`,
      "Panel-Buttons aktiv: Ticket erstellen, Anleitung, Setup reparieren.",
      `Text-Fallbacks aktiv: \`${config.textCommandPrefix}ticket-setup\`, \`${config.textCommandPrefix}ticket-anleitung\`, \`${config.textCommandPrefix}add <Person> Grund\`.`,
    ].join("\n");
  }

  function canManageTickets(member, memberPermissions) {
    return (
      hasTicketAdminRole(member) ||
      memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      memberPermissions?.has(PermissionFlagsBits.ManageChannels)
    );
  }

  function hasTicketAdminRole(member) {
    return memberHasAnyRole(member, [config.ticketAdminRoleId]);
  }

  function memberHasAnyRole(member, roleIds) {
    const ids = roleIds.filter(Boolean);

    if (ids.length === 0 || !member) {
      return false;
    }

    if (member.roles?.cache) {
      return ids.some((roleId) => member.roles.cache.has(roleId));
    }

    if (Array.isArray(member.roles)) {
      return ids.some((roleId) => member.roles.includes(roleId));
    }

    return false;
  }

  function isTicketInteraction(interaction) {
    if (interaction.isChatInputCommand?.()) {
      return ["add", "ticket-anleitung", "ticket-setup"].includes(
        interaction.commandName,
      );
    }

    const customId = interaction.customId ?? "";

    return customId.startsWith("ticket:");
  }

  async function replyTicketError(interaction, content) {
    if (!interaction.isRepliable?.()) {
      return;
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true }).catch(() => {});
      return;
    }

    await interaction.reply({ content, ephemeral: true }).catch(() => {});
  }

  function getModalText(interaction, customId) {
    try {
      return interaction.fields.getTextInputValue(customId).trim();
    } catch {
      return "";
    }
  }

  function trimEmbedField(value) {
    const text = String(value || "-").trim() || "-";

    return text.length > 1024 ? `${text.slice(0, 1021)}...` : text;
  }

  function formatDiscordTimestamp(iso, fallback) {
    const time = Date.parse(iso ?? "");

    if (!Number.isFinite(time)) {
      return fallback;
    }

    return `<t:${Math.floor(time / 1000)}:f>`;
  }

  function trimReason(reason) {
    return String(reason ?? "").length > 512
      ? `${String(reason).slice(0, 509)}...`
      : String(reason ?? "");
  }
}

export function readTicketConfig(env) {
  return {
    governmentRoleIds: readList(env.DISCORD_GOVERNMENT_ROLE_IDS),
    memberImageDeadlineMs: readMs(
      env.MEMBER_IMAGE_DEADLINE_MS,
      48 * 60 * 60 * 1000,
    ),
    memberImageDmDelayMs: readMs(
      env.MEMBER_IMAGE_DM_DELAY_MS,
      4 * 60 * 60 * 1000,
    ),
    memberImageLogChannelId: env.DISCORD_MEMBER_IMAGE_LOG_CHANNEL_ID?.trim() || null,
    memberImagePollMs: readMs(env.MEMBER_IMAGE_POLL_MS, 60_000),
    textCommandPrefix:
      env.DISCORD_TEXT_COMMAND_PREFIX?.trim() || DEFAULT_TEXT_COMMAND_PREFIX,
    ticketAdminRoleId:
      env.DISCORD_TICKET_ADMIN_ROLE_ID?.trim() || DEFAULT_TICKET_ADMIN_ROLE_ID,
    ticketCategoryId: env.DISCORD_TICKET_CATEGORY_ID?.trim() || null,
    ticketDraftTtlMs: readMs(env.TICKET_DRAFT_TTL_MS, 15 * 60_000),
    ticketLogChannelId: env.DISCORD_TICKET_LOG_CHANNEL_ID?.trim() || null,
    ticketPanelChannelId: env.DISCORD_TICKET_PANEL_CHANNEL_ID?.trim() || null,
    ticketViewRoleIds:
      readList(env.DISCORD_TICKET_VIEW_ROLE_IDS).length > 0
        ? readList(env.DISCORD_TICKET_VIEW_ROLE_IDS)
        : DEFAULT_TICKET_VIEW_ROLE_IDS,
  };
}

function readMs(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 1000 ? Math.trunc(number) : fallback;
}

function readList(value) {
  return [
    ...new Set(
      String(value ?? "")
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
