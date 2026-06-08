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

Im Discord Developer Portal muss beim Bot der Server Members Intent aktiv sein, sonst kann Discord keine vollstaendige Mitgliederliste liefern.
