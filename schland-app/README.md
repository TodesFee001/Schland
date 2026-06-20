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
- Discord-Sync fuer Einladungen live beim Speichern und Moderationsregister per Vercel-Cron vorbereitet

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
CRON_SECRET=
DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_INVITE_CHANNEL_ID=
GOOGLE_DRIVE_CLIENT_EMAIL=
GOOGLE_DRIVE_PRIVATE_KEY=
GOOGLE_DRIVE_ROOT_FOLDER_ID=1FPOUB-Uj_mX5X26asct7KS06Ulwj5V4Z
GOOGLE_DOCS_TEMPLATE_ID=1xRbjl9ue0Ve6s4WYX_pJ81BMvmXAuEiP
GOOGLE_DOCS_OFFICIAL_ADVICE_TEMPLATE_ID=
GOOGLE_DOCS_OFFICIAL_ADVICE_FOLDER_ID=
OFFICIAL_ADVICE_DOCS_ENABLED=1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=low
OPENAI_TIMEOUT_MS=55000
```

`SUPABASE_SERVICE_ROLE_KEY` ist nur fuer serverseitige Admin-Aufgaben noetig und darf niemals im Browser genutzt werden.
`DISCORD_BOT_SYNC_TOKEN` schuetzt die internen Bot-Endpunkte und muss spaeter identisch im Bot hinterlegt werden.
`CRON_SECRET` schuetzt den geplanten Vercel-Aufruf. `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_ID` und `DISCORD_CLIENT_SECRET` gehoeren zur Discord-App. `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` und `DISCORD_INVITE_CHANNEL_ID` braucht der Sync, um Einladungen zu erstellen und Auditlogs zu lesen.

## KI-Sanktionsberater

Der KI-Sanktionsberater bleibt ein Beratungswerkzeug. Er fuehrt keine Sanktionen aus; Warn/Kick/Ban werden erst durch einen berechtigten Menschen per separatem Button in die Bot-Queue gelegt.

- Die Hauptquellen sind BRS-StGB `1UU0oElWYKlGImZA-L_O5jeKZcfCaJ_1gVnb6IpEC-Vo` und Regelwerk Schland `1XzgpBgIcZoqFkugGBPwfMCZtG91eAZvCd79k3FEDZBQ`.
- Jede KI-Ausgabe muss `recommendedMeasures` enthalten. Auch unklare Faelle bekommen konkrete naechste Schritte wie Dokumentation, Anhoerung, Belege nachfordern oder manuelle Entscheidung.
- Harte Empfehlungen `warn`, `kick` und `ban` brauchen konkrete Rechtsgrundlagen. Logik- oder Analogieentscheidungen werden nur unter `reasoningBasis` begruendet und nicht als exakte Regelstelle ausgegeben.
- Belege werden als untrusted input behandelt. Dateien, URLs, Message-Links, Ticket-Kontext, Dateimetadaten und lesbare Texte landen im Evidence-Manifest; unlesbare oder ausgelassene Inhalte werden in Snapshot, Log und Risikohinweisen sichtbar.
- Fuer detailreiche Begruendungen ist `OPENAI_TIMEOUT_MS=55000` vorgesehen; das Modell kann ueber `OPENAI_MODEL` und `OPENAI_REASONING_EFFORT` konfiguriert werden.

## Offizielle Google-Docs-Dokumente

Aus einer fertigen KI-Auswertung kann ein offizielles Google Docs Dokument erstellt werden. Die Erstellung kopiert immer eine Vorlage und befuellt Platzhalter per Google Docs API, damit Layout, Bild/Logo und Gestaltung erhalten bleiben.

Erforderliche Service-Account-Scopes:

- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents`

Vorlagen/Fallback:

- `GOOGLE_DOCS_OFFICIAL_ADVICE_TEMPLATE_ID` wird bevorzugt.
- Ohne diese Variable wird `GOOGLE_DOCS_TEMPLATE_ID` genutzt.
- `GOOGLE_DOCS_OFFICIAL_ADVICE_FOLDER_ID` kann einen Drive-Zielordner festlegen.
- Ohne Zielordner wird der lokale/Drive-Fallback `Zu pruefen` verwendet.

Pflicht-Platzhalter in der Vorlage:

```text
{{AZ}}, {{DATUM}}, {{FALL_AZ}}, {{TITEL}}, {{ZIELPERSON}}, {{ZIEL_DISCORD_ID}},
{{VORFALL_ZEIT}}, {{SACHVERHALT}}, {{BEWEISWURDIGUNG}}, {{RECHTSGRUNDLAGEN}},
{{MASSNAHMEN}}, {{EMPFEHLUNG_KURZ}}, {{BEGRUENDUNG}}, {{RISIKEN}},
{{FEHLENDE_INFOS}}, {{ERSTELLT_DURCH}}, {{MODELL}}, {{ANLAGEN}}
```

Wenn Platzhalter fehlen, wird die Vorlage trotzdem kopiert und der generierte Inhalt am Dokumentende eingefuegt. Der Fall erhaelt ein offizielles Aktenzeichen im Format `BRS/ERM/NN/MM/YYYY/KI`; bestehende `files` und offizielle Dokumente werden fuer den Monats-Fortlauf beruecksichtigt. Die Nummernvergabe passiert ueber `official_document_sequences` race-sicher in der Datenbank.

## Interne Discord-Bot-Schnittstelle

Vorbereitet sind geschuetzte Endpunkte unter `/api/discord-bot/*`:

- `GET /api/discord-bot/privacy` liefert Mitglieder mit Discord-ID und ob deren Auswertung erlaubt ist.
- `GET /api/discord-bot/invites` liefert offene Datenbank-Einladungen fuer den Bot.
- `PATCH /api/discord-bot/invites` meldet erstellte, genutzte, abgelaufene oder fehlgeschlagene Einladungen zurueck.
- `POST /api/discord-bot/moderation-events` schreibt Timeouts, Bans, Kicks und Voice-Disconnects in das Moderationsregister.
- `GET /api/discord-bot/sync` laeuft per Vercel-Cron als Fallback, erstellt offene Discord-Einladungen und synchronisiert Discord-Auditlogs.

Alle Endpunkte erwarten `Authorization: Bearer <DISCORD_BOT_SYNC_TOKEN>` oder den Header `x-schland-bot-token`.
Der Cron-Endpunkt erwartet `Authorization: Bearer <CRON_SECRET>`.

DB-Einladungen werden beim Speichern sofort live an Discord gesendet. Der Vercel-Cron laeuft zusaetzlich minuetlich als Fallback und fuer Auditlog-Syncs. Fuer echte Gateway-Live-Events ohne Polling braucht Discord einen dauerhaft laufenden Bot-Prozess ausserhalb normaler Vercel-Functions.

Der aktuelle Production-Deploy liegt auf `https://schland.vercel.app`. Wenn Deployment Protection aktiv ist, verlangt Vercel vor dem Aufruf eine Vercel-Anmeldung oder einen Bypass.

## Naechste sinnvolle Schritte

1. Supabase Auth mit Login und 2FA aktivieren.
2. Rollen- und Rechteverwaltung bearbeitbar machen.
3. Mitgliederakten bearbeiten und Feld-Aenderungen protokollieren.
4. Datei-Uploads ueber Supabase Storage einbauen.
5. Discord-Guild-ID, Bot-Token und Invite-Channel in Vercel hinterlegen.
6. Optional spaeter einen dauerhaften Discord-Gateway-Bot fuer Live-Events ergaenzen.
