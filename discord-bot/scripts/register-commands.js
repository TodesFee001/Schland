import {
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

const required = ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"];
const missing = required.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

const commands = [
  new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("Erstellt oder aktualisiert das Schland Ticketpanel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Fuegt eine Person zu einem aktiven Ticket hinzu.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Person, die Zugriff erhalten soll.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("grund")
        .setDescription("Optionaler Grund fuer das Hinzufuegen.")
        .setMaxLength(300)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(
    process.env.DISCORD_CLIENT_ID.trim(),
    process.env.DISCORD_GUILD_ID.trim(),
  ),
  { body: commands },
);

console.log(`Registered ${commands.length} Schland bot commands.`);
