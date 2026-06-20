import { REST, Routes } from "discord.js";

import { buildSchlandCommands } from "../src/commands.js";

const applicationId =
  process.env.DISCORD_CLIENT_ID?.trim() ||
  process.env.DISCORD_APPLICATION_ID?.trim();
const required = ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"];
const missing = required.filter((key) => !process.env[key]?.trim());

if (!applicationId) {
  missing.push("DISCORD_CLIENT_ID oder DISCORD_APPLICATION_ID");
}

if (missing.length > 0) {
  throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

const commands = buildSchlandCommands();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(
    applicationId,
    process.env.DISCORD_GUILD_ID.trim(),
  ),
  { body: commands },
);

console.log(`Registered ${commands.length} Schland bot commands.`);
