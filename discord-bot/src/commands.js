import { SlashCommandBuilder } from "discord.js";

export function buildSchlandCommands() {
  return [
    new SlashCommandBuilder()
      .setName("ticket-setup")
      .setDescription("Erstellt oder repariert Ticketpanel, Logs und Kategorie.")
      .setDMPermission(false),
    new SlashCommandBuilder()
      .setName("ticket-anleitung")
      .setDescription("Zeigt die kurze Arbeitsanweisung fuer das Ticket-System.")
      .setDMPermission(false),
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
      .setDMPermission(false),
  ].map((command) => command.toJSON());
}
