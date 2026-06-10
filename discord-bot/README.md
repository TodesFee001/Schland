# Schland Discord Bot

Dauerlaeufer fuer Railway. Der Dienst verbindet sich dauerhaft mit dem Discord Gateway und schreibt Ereignisse ueber die geschuetzten Bot-API-Endpunkte der Schland-Website.

## Railway

Service Root Directory: `/discord-bot`

Start Command: `npm start`

Noetige Variablen:

- `DISCORD_BOT_TOKEN`
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
