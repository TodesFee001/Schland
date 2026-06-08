# Schland Intern

Interne Webanwendung fuer Mitgliederakten, Datei-Datenbank, Rollen, Rechte und Aktivitaetsauswertung.

## Aktueller Stand

- Next.js App Router fuer Vercel
- Supabase-Client vorbereitet
- Supabase-Migration fuer Rollen, Rechte, Mitgliederakten, Dateien, Aktivitaet und Aktenprotokoll
- Erste interne Arbeitsoberflaeche mit Dashboard, Aktenansicht, Datei-Datenbank, Rollen und Sync-Status
- Login mit Registrierung, einmaligem Admin-Erststart und 2FA-Verwaltung
- Live-Datenanbindung an Supabase mit sauberen Leerzustaenden
- Mitgliederakten koennen mit Pflichtgrund angelegt und im Aktenlog protokolliert werden
- Discord-Bot-Implementierung bewusst geparkt und als letzter Schritt vorgesehen

## Lokal starten

```bash
npm run dev
```

Die App laeuft danach lokal auf `http://localhost:3000`.

## Supabase einrichten

1. Neues Supabase-Projekt erstellen.
2. Alle SQL-Dateien aus `supabase/migrations` in Reihenfolge ausfuehren oder per Supabase CLI deployen.
3. `.env.example` zu `.env.local` kopieren und Werte eintragen:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

4. In der App auf `/login` den ersten Account erstellen und anmelden.
5. Unter `Einstellungen -> Erststart` einmalig `Administrator aktivieren` nutzen.
6. Danach unter `/security` oder `Einstellungen -> 2FA` den Authenticator verbinden.

Wenn bereits ein Admin existiert, ist der Erststart automatisch geschlossen.

## Vercel und GitHub

1. Repository auf GitHub hochladen.
2. In Vercel ein neues Projekt aus dem GitHub-Repository importieren.
3. Das Vercel-Projekt `schland` ist vorbereitet und nutzt als Root Directory `schland-app`.
4. Framework Preset muss `Next.js` sein.
5. Die Supabase-Umgebungsvariablen in Vercel hinterlegen:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ovfhieumrllwtghpvwem.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fCEJWNSfV7SEt46MYRS0xg_BNvfLTyg
SUPABASE_SERVICE_ROLE_KEY=
DISCORD_BOT_SYNC_TOKEN=
```

`SUPABASE_SERVICE_ROLE_KEY` ist nur fuer serverseitige Admin-Aufgaben noetig und darf niemals im Browser genutzt werden.
`DISCORD_BOT_SYNC_TOKEN` schuetzt die internen Bot-Endpunkte und muss spaeter identisch im Bot hinterlegt werden.

## Interne Discord-Bot-Schnittstelle

Die eigentliche Bot-Implementierung bleibt der letzte Schritt. Vorbereitet sind aber bereits geschuetzte Endpunkte unter `/api/discord-bot/*`:

- `GET /api/discord-bot/privacy` liefert Mitglieder mit Discord-ID und ob deren Auswertung erlaubt ist.
- `GET /api/discord-bot/invites` liefert offene Datenbank-Einladungen fuer den Bot.
- `PATCH /api/discord-bot/invites` meldet erstellte, genutzte, abgelaufene oder fehlgeschlagene Einladungen zurueck.
- `POST /api/discord-bot/moderation-events` schreibt Timeouts, Bans, Kicks und Voice-Disconnects in das Moderationsregister.

Alle Endpunkte erwarten `Authorization: Bearer <DISCORD_BOT_SYNC_TOKEN>` oder den Header `x-schland-bot-token`.

Der aktuelle Production-Deploy liegt auf `https://schland.vercel.app`. Wenn Deployment Protection aktiv ist, verlangt Vercel vor dem Aufruf eine Vercel-Anmeldung oder einen Bypass.

## Naechste sinnvolle Schritte

1. Supabase Auth mit Login und 2FA aktivieren.
2. Rollen- und Rechteverwaltung bearbeitbar machen.
3. Mitgliederakten bearbeiten und Feld-Aenderungen protokollieren.
4. Datei-Uploads ueber Supabase Storage einbauen.
5. Discord-Bot erst danach verbinden.
