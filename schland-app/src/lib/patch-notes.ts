export type PatchNote = {
  date: string;
  id: string;
  items: string[];
  title: string;
  type: "fix" | "feature" | "system";
  version: string;
};

// Jede produktive Aenderung bekommt hier ab jetzt einen Eintrag.
export const patchNotes: PatchNote[] = [
  {
    date: "10.06.2026",
    id: "lockdown-snapshot-fallback-restore",
    items: [
      "Discord-Bot bricht beim Lockdown-Beenden nicht mehr ab, wenn kein Snapshot gespeichert wurde.",
      "Ohne Snapshot entfernt der Bot gezielt erkannte Lockdown-Sperren von Nicht-Admin-Rollen.",
      "Lockdown-Aktivierung speichert Rechte jetzt vor der Notfall-DM-Aufloesung, damit Discord-Rate-Limits keinen fehlenden Snapshot mehr verursachen.",
      "Fehler beim Senden oder Aufloesen der Notfall-DMs werden protokolliert, blockieren aber nicht mehr den Rechte-Snapshot.",
      "Notfall-Reparatur arbeitet mit einer stabilen Overwrite-Liste, damit Discord-Cache-Aenderungen den Restore nicht festhaengen.",
    ],
    title: "Lockdown-Restore abgesichert",
    type: "fix",
    version: "0.9.10",
  },
  {
    date: "10.06.2026",
    id: "lockdown-login-emergency-gate",
    items: [
      "Login-Seite bekommt bei aktivem Lockdown einen vollflaechigen Notfall-Sperrbildschirm.",
      "Lockdown-Sperrbildschirm verdeckt den normalen Login, bis der Notfallschluessel eingetragen wurde.",
      "Emergency-Sound startet automatisch soweit der Browser es erlaubt und faellt auf erste Eingabe zurueck.",
      "Lockdown kann im aktiven Zustand auch mit Notfallschluessel beendet werden, falls 2FA gerade blockiert.",
      "Beim Beenden bleibt der Discord-Restore-Befehl erhalten, damit der Bot alte Channel-Rechte wiederherstellt.",
    ],
    title: "Lockdown-Sperrbildschirm",
    type: "feature",
    version: "0.9.9",
  },
  {
    date: "10.06.2026",
    id: "lockdown-ui-recipient-select",
    items: [
      "Lockdown-Overlay deutlich kompakter und weniger stoerend gestaltet.",
      "Lockdown-Panel optisch aufgeraeumt und Statuskarten beruhigt.",
      "Notfallschluessel-Empfaenger koennen jetzt aus verknuepften Mitgliedern ausgewaehlt werden, statt Discord-IDs per Hand einzutragen.",
      "Lockdown-Felder haben eigene Kontrastklassen, damit Eingaben und Mitgliedernamen sichtbar bleiben.",
      "losoverdrive bleibt als Sicherheits-Empfaenger fuer Lockdown-DMs hinterlegt.",
    ],
    title: "Lockdown-UI bereinigt",
    type: "fix",
    version: "0.9.8",
  },
  {
    date: "10.06.2026",
    id: "drive-import-lockdown",
    items: [
      "Google-Drive-Dokumente als geordnete Datei-Datenbank-Eintraege importiert und Kategorien fuer Kommunikation, Ermittlungen, Gesetzgebung, Verwaltung, Sonderbereiche und Ungeordnet angelegt.",
      "Externe Drive-Dateien koennen ueber die vorhandene geschuetzte Oeffnen-Logik direkt geoeffnet werden.",
      "Roten Lockdown-Bereich in den Einstellungen mit animiertem Emergency-Overlay und optionalem Alarmton ergaenzt.",
      "Lockdown sperrt Webzugriff ueber Notfallschluessel und queued Discord-Befehle fuer den Railway-Bot.",
      "Discord-Bot kann Nicht-Admin-Rollen kanalweit sperren, wichtige Channels lesbar lassen, Notfallcodes per DM senden und Rechte beim Entsperren wiederherstellen.",
      "Supabase Advisor-Funde fuer Lockdown-Funktionen nachgehaertet: keine anonyme Ausfuehrung und neue FK-Indizes.",
    ],
    title: "Drive-Import und Lockdown",
    type: "feature",
    version: "0.9.7",
  },
  {
    date: "10.06.2026",
    id: "roles-permissions-restructure",
    items: [
      "Neue Zielstruktur fuer Rollen und Berechtigungen als additive Migration vorbereitet.",
      "Root Owner und Platform Admin werden getrennt und in der Benutzerverwaltung geschuetzt.",
      "Legacy-Administrator wird in der Migration auf Root Owner und Platform Admin migriert.",
      "Legacy-Administrator wird vor Anlage des neuen Platform Admin umbenannt, damit der eindeutige Rollenname nicht kollidiert.",
      "Neue Permission-Gruppen fuer Akten, Ermittlungen, Kommunikation, Audit und Ordnerrechte ergaenzt.",
      "Erststart- und Rollenmeldungen wurden auf Root Owner / Administrator angepasst.",
    ],
    title: "Rollenstruktur vorbereitet",
    type: "system",
    version: "0.9.6",
  },
  {
    date: "10.06.2026",
    id: "hardware-key-mfa",
    items: [
      "Hardware-Key/WebAuthn als zweite 2FA-Methode ergaenzt.",
      "QR/TOTP bleibt bestehen, Nutzer koennen Code oder Key verwenden.",
      "Die 2FA-Seite zeigt klare Hinweise, wenn Browser oder Supabase-Projekt WebAuthn noch nicht zulassen.",
    ],
    title: "Hardware-Key fuer 2FA",
    type: "feature",
    version: "0.9.5",
  },
  {
    date: "10.06.2026",
    id: "session-countdown-timer",
    items: [
      "Oben rechts zeigt jetzt ein Timer die verbleibende Login-Sitzung.",
      "Die Anzeige wechselt vor Ablauf auf Warnfarbe.",
      "Bei Ablauf wird die Seite aktualisiert, damit der erneute Login sofort greift.",
    ],
    title: "Session-Timer sichtbar",
    type: "feature",
    version: "0.9.4",
  },
  {
    date: "09.06.2026",
    id: "auth-session-timebox",
    items: [
      "Anmeldesitzungen laufen jetzt hart nach 45 Minuten ab.",
      "Nach Ablauf wird die Supabase-Session geloescht und der Login neu verlangt.",
      "2FA muss nach dem neuen Login erneut bestaetigt werden.",
    ],
    title: "Session-Limit auf 45 Minuten",
    type: "fix",
    version: "0.9.3",
  },
  {
    date: "09.06.2026",
    id: "member-case-list-load-limit",
    items: [
      "Mitgliederkartei laedt jetzt bis zu 1000 Akten statt nur die neuesten 50.",
      "Vorhandene Discord-Akten wie Marcel / 777 fallen dadurch nicht mehr aus der sichtbaren Liste.",
      "Datenbankabgleich bestaetigt: Marcel / 777 ist als Akte vorhanden und auf dem Server markiert.",
    ],
    title: "Alle Mitgliederakten sichtbar",
    type: "fix",
    version: "0.9.2",
  },
  {
    date: "09.06.2026",
    id: "member-cases-preserve-off-server",
    items: [
      "Discord-Leave, Kick und Ban loeschen keine Mitgliederakten mehr.",
      "Betroffene Akten werden nur als Nicht auf Server markiert.",
      "Rollen, Dateien, Strafen, Notizen und sonstige Akteninhalte bleiben erhalten.",
      "Live-Event und Vollabgleich ueberschreiben manuell gepflegte Aktenfelder nicht mehr.",
    ],
    title: "Akten bleiben nach Discord-Abgang erhalten",
    type: "fix",
    version: "0.9.1",
  },
  {
    date: "09.06.2026",
    id: "patchnotes-layer",
    items: [
      "Eigenes Patchnotes-Layer in der oberen Leiste ergaenzt.",
      "Patchnotes zentral als App-Daten abgelegt, damit neue Anpassungen ab jetzt sauber mitgeschrieben werden.",
      "Patchnotes bewusst nicht als neue Hauptseite oder Dashboard-Kachel umgesetzt.",
    ],
    title: "Patchnotes eingefuehrt",
    type: "feature",
    version: "0.9.0",
  },
  {
    date: "09.06.2026",
    id: "member-case-reason-dialog",
    items: [
      "Oeffnen-Button in der Mitgliederkartei ist direkt klickbar.",
      "Zugriffsgrund wird jetzt in einem Dialog abgefragt.",
      "Akte oeffnet erst nach Bestaetigung und wird weiterhin protokolliert.",
    ],
    title: "Akten oeffnen per Grund-Dialog",
    type: "feature",
    version: "0.8.3",
  },
  {
    date: "09.06.2026",
    id: "file-actions",
    items: [
      "Verknuepfte Dateien in Akten koennen direkt geoeffnet werden.",
      "Dateien koennen in der Datei-Datenbank verschoben werden.",
      "Dateien koennen aus Datenbank und Supabase Storage geloescht werden.",
      "Direktes Oeffnen laeuft ueber geschuetzte, kurz gueltige Supabase-Links ohne App-Vorschau.",
    ],
    title: "Dateien oeffnen, verschieben und loeschen",
    type: "feature",
    version: "0.8.2",
  },
  {
    date: "09.06.2026",
    id: "auth-mfa-case-view",
    items: [
      "E-Mail-Bestaetigungslinks nutzen die produktive Schland-Adresse statt localhost.",
      "2FA-QR-Code zeigt Schland DB als Namen statt localhost.",
      "Aktendetails sind von der Mitgliederkartei getrennt.",
      "Discord-Benutzername und Discord-Anzeigename werden in Akten getrennt angezeigt.",
    ],
    title: "Login, 2FA und Aktenansicht bereinigt",
    type: "fix",
    version: "0.8.1",
  },
  {
    date: "09.06.2026",
    id: "discord-username-sync",
    items: [
      "Discord-Sync schreibt den echten Benutzernamen bevorzugt vor dem Anzeigenamen.",
      "Railway-Bot und Vercel-Rest-Sync nutzen dieselbe Reihenfolge.",
    ],
    title: "Discordnamen-Sync korrigiert",
    type: "fix",
    version: "0.8.0",
  },
];
