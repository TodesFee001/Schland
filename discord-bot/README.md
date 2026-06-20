# Schland Discord Bot

Dauerlaeufer fuer Railway. Der Dienst verbindet sich dauerhaft mit dem Discord Gateway und schreibt Ereignisse ueber die geschuetzten Bot-API-Endpunkte der Schland-Website.

## Railway

Service Root Directory: `/discord-bot`

Start Command: `npm start`

Noetige Variablen:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID` - fuer `npm run register-commands`
- `DISCORD_GUILD_ID`
- `DISCORD_INVITE_CHANNEL_ID`
- `DISCORD_BOT_SYNC_TOKEN`
- `SCHLAND_APP_URL`

Optionale Lockdown-Variablen:

- `LOCKDOWN_POLL_MS` - Standard `5000`
- `LOCKDOWN_READONLY_CHANNEL_IDS` - kommagetrennte wichtige Channel, die im Lockdown lesbar bleiben
- `LOCKDOWN_RECIPIENT_DISCORD_IDS` - kommagetrennte User-IDs, die den Notfallschluessel per DM bekommen
- `LOCKDOWN_RECIPIENT_USERNAMES` - kommagetrennte Discordnamen als Fallback, Standard `losoverdrive`

Im Discord Developer Portal muss beim Bot der Server Members Intent aktiv sein, sonst kann Discord keine vollstaendige Mitgliederliste liefern.

Fuer Lockdown braucht der Bot zusaetzlich `Manage Channels`, damit Channel-Overwrites gesetzt und spaeter wiederhergestellt werden koennen.

## Altersrollen aus Mitgliederaktenbogen

Der bestehende Mitgliederaktenbogen fragt im Modal `Mitgliederakte - Basis` optional das Alter ab. Nach erfolgreichem Speichern synchronisiert der Bot genau eine Altersrolle:

| Alter | Rollen-ID |
| ---: | --- |
| 14-15 | `1164278939598995516` |
| 16-17 | `1164278939565424669` |
| 18-19 | `1164278939565424668` |
| 20+ | `1164278939565424667` |

Optionale Variablen:

- `DISCORD_AGE_ROLE_SYNC_ENABLED` - `1` aktiv, `0` deaktiviert
- `DISCORD_AGE_ROLE_14_ID`
- `DISCORD_AGE_ROLE_16_ID`
- `DISCORD_AGE_ROLE_18_ID`
- `DISCORD_AGE_ROLE_20_ID`

Leeres oder ungueltiges Alter aendert keine Rolle. Gueltiges Alter unter 14 entfernt vorhandene Altersrollen aus dieser Vierer-Liste und setzt keine neue. Der Bot veraendert keine anderen Rollen.

Der Bot braucht `Manage Roles`, der Server Members Intent muss aktiv sein, und die hoechste Bot-Rolle muss oberhalb der vier Altersrollen stehen. Wenn eine Rolle fehlt oder die Hierarchie nicht passt, bleibt die Akte gespeichert und der Fehler wird im Bot-Log sowie ueber den Mitgliederakten-Log protokolliert.

## Slash Commands

Der laufende Bot registriert die Guild-Commands beim Start automatisch, sofern `DISCORD_CLIENT_ID` oder `DISCORD_APPLICATION_ID` gesetzt ist. Manuell geht es weiterhin so:

```bash
npm run register-commands
```

Registriert werden:

- `/ticket-setup` - legt Panel, Ticket-Log, Bilder-Protokoll und Kategorie an oder nutzt die gesetzten IDs.
- `/ticket-anleitung` - zeigt die kurze Arbeitsanweisung direkt in Discord.
- `/add user grund?` - fuegt eine Person zu einem aktiven Ticket hinzu, aber nie eine beim Erstellen explizit ausgeschlossene Person.

Falls Discord beim Tippen von `/` keine Befehlsliste zeigt, funktionieren dieselben Adminpfade als normale Nachrichten:

- `!ticket-setup`
- `!ticket-anleitung`
- `!add @User optionaler Grund`

## Ticket-System

Standard-Rollen:

- Ticket sichtbar: `1164278939670282261`, `1370092260842278982`, `1164278939670282268`
- Ticket-Admin fuer `/add`: `1164278939670282268`

Optionale Variablen:

- `DISCORD_AUTO_REGISTER_COMMANDS` - Standard `1`; mit `0` deaktivieren.
- `DISCORD_TICKET_AUTO_SETUP` - Standard `1`; mit `0` deaktivieren.
- `DISCORD_TEXT_COMMAND_PREFIX` - Standard `!`
- `DISCORD_TICKET_ADMIN_ROLE_ID`
- `DISCORD_TICKET_VIEW_ROLE_IDS`
- `DISCORD_TICKET_PANEL_CHANNEL_ID`
- `DISCORD_TICKET_LOG_CHANNEL_ID`
- `DISCORD_TICKET_CATEGORY_ID`
- `DISCORD_GOVERNMENT_ROLE_IDS`
- `TICKET_DRAFT_TTL_MS`

Flow:

1. Der Bot legt beim Start `Tickets`, `#ticket-erstellen`, `#ticket-log` und `#bilder-protokoll` an oder repariert sie. Admins koennen das ueber den Panel-Button `Setup reparieren`, `/ticket-setup` oder `!ticket-setup` erneut ausloesen.
2. User klickt im Panel auf `Ticket erstellen`; der Button `Anleitung` zeigt den Ablauf ohne Textbefehl.
3. Der Bot fragt Ticketart, Gegenpartei, ggf. explizit auszuschliessende Regierungsmitglieder, Ort, Zeitpunkt und Details ab.
4. Der Bot erstellt einen privaten Ticketchannel. `@everyone` ist gesperrt, die sichtbaren Rollen und der Ersteller sind erlaubt, ausgeschlossene User bekommen einen direkten Deny.
5. Im Ticket koennen berechtigte Personen per Button weitere Personen hinzufuegen, den KI-Sanktionsberater starten, ein Transcript sichern oder das Ticket schliessen.

Der KI-Sanktionsberater erstellt nur eine Beratung in der Schland-App. Sanktionen werden nicht automatisch von der KI ausgefuehrt; die Umsetzung bleibt ein bewusster Admin-Klick in der bestehenden Moderationsstrecke.

## Mitgliederaktenbilder

Optionale Variablen:

- `DISCORD_MEMBER_IMAGE_LOG_CHANNEL_ID`
- `MEMBER_IMAGE_DM_DELAY_MS` - Standard 4 Stunden
- `MEMBER_IMAGE_DEADLINE_MS` - Standard 48 Stunden nach erfolgreicher DM
- `MEMBER_IMAGE_POLL_MS` - Standard 60 Sekunden

Neue Mitglieder werden in Supabase vorgemerkt. Nach Ablauf der DM-Verzoegerung sendet der Bot eine DM mit der Aufforderung, genau ein Bild als Anhang zu schicken. Gueltige Bilder werden ueber die App-API in `schland-files` gespeichert und als Profilbild der Mitgliederakte verknuepft. Ungueltige Antworten und Fristueberschreitungen werden protokolliert; bei Fristablauf wird eine Warnung in die bestehende Moderationsqueue gelegt.

Fuer Tickettexte und Transcripts muss im Discord Developer Portal zusaetzlich der Message Content Intent aktiviert sein. Fuer neue Mitglieder ist weiterhin der Server Members Intent noetig.
