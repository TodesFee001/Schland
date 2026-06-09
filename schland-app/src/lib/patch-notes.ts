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
