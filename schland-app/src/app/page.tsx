import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthStatus } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getEnvironmentStatus } from "@/lib/env";
import { getWorkspaceData } from "@/lib/workspace-data";
import { redirect } from "next/navigation";

type HomeProps = {
  searchParams: Promise<{
    member?: string;
    section?: string;
    setup?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const authStatus = await getAuthStatus();

  if (authStatus.configured && !authStatus.signedIn) {
    redirect("/login");
  }

  const [dashboardSnapshot, workspaceData] = await Promise.all([
    getDashboardSnapshot(),
    getWorkspaceData(authStatus),
  ]);

  return (
    <WorkspaceShell
      authStatus={authStatus}
      dashboardSnapshot={dashboardSnapshot}
      environmentStatus={getEnvironmentStatus()}
      initialSelectedMemberId={params.member}
      initialSection={params.section}
      setupNotice={getSetupNotice(params.setup)}
      workspaceData={workspaceData}
    />
  );
}

function getSetupNotice(setup?: string) {
  if (setup === "admin-exists") {
    return {
      tone: "warning" as const,
      text: "Es gibt bereits einen Administrator. Der Erststart ist damit geschlossen.",
    };
  }

  if (setup === "admin-claim-error") {
    return {
      tone: "error" as const,
      text: "Administratorrolle konnte nicht aktiviert werden. Bitte Supabase-Benutzer und Migrationen pruefen.",
    };
  }

  if (setup === "missing-supabase") {
    return {
      tone: "error" as const,
      text: "Supabase ist noch nicht verbunden.",
    };
  }

  if (setup === "member-created") {
    return {
      tone: "success" as const,
      text: "Mitgliederakte wurde angelegt und protokolliert.",
    };
  }

  if (setup === "member-opened") {
    return {
      tone: "success" as const,
      text: "Mitgliederakte wurde geoeffnet und im Aktenprotokoll vermerkt.",
    };
  }

  if (setup === "member-create-error") {
    return {
      tone: "error" as const,
      text: "Mitgliederakte konnte nicht angelegt werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "member-open-error") {
    return {
      tone: "error" as const,
      text: "Mitgliederakte konnte nicht geoeffnet werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "member-open-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Oeffnen einer Mitgliederakte muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "member-open-permission") {
    return {
      tone: "error" as const,
      text: "Mitgliederakte konnte nicht geoeffnet werden. Der Account hat keine passende Oeffnen-Berechtigung.",
    };
  }

  if (setup === "member-open-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib vor dem Oeffnen einen Zugriffsgrund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "member-open-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Mitgliederakte wurde nicht gefunden.",
    };
  }

  if (setup === "member-create-aal2") {
    return {
      tone: "warning" as const,
      text: "Deine aktuelle Sitzung ist noch nicht mit 2FA freigeschaltet. Oeffne 2FA und bestaetige einmal den Code.",
    };
  }

  if (setup === "member-create-permission") {
    return {
      tone: "error" as const,
      text: "Mitgliederakte konnte nicht angelegt werden. Der Account hat keine passende Mitglieder-Berechtigung.",
    };
  }

  if (setup === "member-create-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib einen Zugriffsgrund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "member-create-name") {
    return {
      tone: "warning" as const,
      text: "Bitte gib einen Namen fuer die Mitgliederakte an.",
    };
  }

  if (setup === "member-create-age") {
    return {
      tone: "warning" as const,
      text: "Das Alter darf nicht negativ sein.",
    };
  }

  if (setup === "member-create-duplicate") {
    return {
      tone: "warning" as const,
      text: "Diese Discord-ID ist bereits in einer Mitgliederakte hinterlegt.",
    };
  }

  if (setup === "member-file-linked") {
    return {
      tone: "success" as const,
      text: "Datei wurde mit der Mitgliederakte verknuepft und protokolliert.",
    };
  }

  if (setup === "member-file-unlinked") {
    return {
      tone: "success" as const,
      text: "Dateiverknuepfung wurde geloest und protokolliert.",
    };
  }

  if (setup === "member-file-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Verwalten von Dateiverknuepfungen muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "member-file-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer die Dateiverknuepfung einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "member-file-missing") {
    return {
      tone: "warning" as const,
      text: "Mitgliederakte oder Datei wurde nicht gefunden.",
    };
  }

  if (setup === "member-file-file-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Datei wurde nicht gefunden.",
    };
  }

  if (setup === "member-file-link-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Dateiverknuepfung ist nicht mehr vorhanden.",
    };
  }

  if (setup === "member-file-permission") {
    return {
      tone: "error" as const,
      text: "Dateiverknuepfung konnte nicht geaendert werden. Der Account hat keine passende Akten- oder Datei-Berechtigung.",
    };
  }

  if (setup === "member-file-duplicate") {
    return {
      tone: "warning" as const,
      text: "Diese Datei ist bereits mit der Mitgliederakte verknuepft.",
    };
  }

  if (setup === "member-file-error") {
    return {
      tone: "error" as const,
      text: "Dateiverknuepfung konnte nicht geaendert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "member-analytics-enabled") {
    return {
      tone: "success" as const,
      text: "Discord-Auswertung wurde fuer diese Mitgliederakte wieder aktiviert.",
    };
  }

  if (setup === "member-analytics-disabled") {
    return {
      tone: "success" as const,
      text: "Discord-Auswertung wurde fuer diese Mitgliederakte deaktiviert und protokolliert.",
    };
  }

  if (setup === "member-analytics-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Aendern der Discord-Auswertung muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "member-analytics-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer die Datenschutz-Aenderung einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "member-analytics-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Mitgliederakte wurde nicht gefunden.",
    };
  }

  if (setup === "member-analytics-permission") {
    return {
      tone: "error" as const,
      text: "Discord-Auswertung konnte nicht geaendert werden. Der Account hat keine passende Mitglieder-Berechtigung.",
    };
  }

  if (setup === "member-analytics-error") {
    return {
      tone: "error" as const,
      text: "Discord-Auswertung konnte nicht geaendert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "discord-invite-created") {
    return {
      tone: "success" as const,
      text: "Discord-Einladung wurde als Datenbankauftrag angelegt. Der Bot erstellt spaeter daraus eine 1x nutzbare Einladung mit 1 Tag Gueltigkeit.",
    };
  }

  if (setup === "discord-invite-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Anlegen einer Discord-Einladung muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "discord-invite-name") {
    return {
      tone: "warning" as const,
      text: "Bitte gib an, wen du einladen moechtest.",
    };
  }

  if (setup === "discord-invite-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer die Discord-Einladung einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "discord-invite-permission") {
    return {
      tone: "warning" as const,
      text: "Bitte verknuepfe die Discord-Einladung mit einer Berechtigung.",
    };
  }

  if (setup === "discord-invite-member") {
    return {
      tone: "warning" as const,
      text: "Das ausgewaehlte Zielmitglied wurde nicht gefunden.",
    };
  }

  if (setup === "discord-invite-denied") {
    return {
      tone: "error" as const,
      text: "Discord-Einladung konnte nicht angelegt werden. Dem Account fehlt die passende Berechtigung.",
    };
  }

  if (setup === "discord-invite-error") {
    return {
      tone: "error" as const,
      text: "Discord-Einladung konnte nicht angelegt werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "role-assigned") {
    return {
      tone: "success" as const,
      text: "Rolle wurde zugewiesen.",
    };
  }

  if (setup === "role-removed") {
    return {
      tone: "success" as const,
      text: "Rolle wurde entzogen.",
    };
  }

  if (setup === "role-assignment-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Aendern von Rollen muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "role-assignment-permission") {
    return {
      tone: "error" as const,
      text: "Rolle konnte nicht geaendert werden. Der Account hat keine Benutzerverwaltung-Berechtigung.",
    };
  }

  if (setup === "role-assignment-last-admin") {
    return {
      tone: "warning" as const,
      text: "Der letzte Administrator kann nicht entfernt werden.",
    };
  }

  if (setup === "role-assignment-missing") {
    return {
      tone: "warning" as const,
      text: "Benutzer oder Rolle wurde nicht gefunden.",
    };
  }

  if (setup === "role-assignment-error") {
    return {
      tone: "error" as const,
      text: "Rolle konnte nicht geaendert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "folder-created") {
    return {
      tone: "success" as const,
      text: "Ordner wurde angelegt.",
    };
  }

  if (setup === "folder-deleted") {
    return {
      tone: "success" as const,
      text: "Leerer Ordner wurde geloescht.",
    };
  }

  if (setup === "folder-permission-saved") {
    return {
      tone: "success" as const,
      text: "Ordnerrecht wurde gespeichert.",
    };
  }

  if (setup === "folder-permission-removed") {
    return {
      tone: "success" as const,
      text: "Ordnerrecht wurde entzogen.",
    };
  }

  if (setup === "folder-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Aendern von Ordnern und Ordnerrechten muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "folder-permission-denied") {
    return {
      tone: "error" as const,
      text: "Ordner konnte nicht geaendert werden. Der Account hat keine Ordnerverwaltung-Berechtigung.",
    };
  }

  if (setup === "folder-missing") {
    return {
      tone: "warning" as const,
      text: "Ordner, Kategorie oder Rollenangabe fehlt.",
    };
  }

  if (setup === "folder-parent") {
    return {
      tone: "warning" as const,
      text: "Der uebergeordnete Ordner passt nicht zur gewaehlten Kategorie.",
    };
  }

  if (setup === "folder-duplicate") {
    return {
      tone: "warning" as const,
      text: "In dieser Kategorie gibt es bereits einen Ordner mit diesem Namen.",
    };
  }

  if (setup === "folder-not-empty") {
    return {
      tone: "warning" as const,
      text: "Ordner kann nur geloescht werden, wenn keine Dateien oder Unterordner enthalten sind.",
    };
  }

  if (setup === "folder-error") {
    return {
      tone: "error" as const,
      text: "Ordner konnte nicht geaendert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "file-uploaded") {
    return {
      tone: "success" as const,
      text: "Datei wurde hochgeladen und gespeichert.",
    };
  }

  if (setup === "file-upload-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Hochladen von Dateien muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "file-upload-missing") {
    return {
      tone: "warning" as const,
      text: "Bitte waehle eine Datei und eine Kategorie aus.",
    };
  }

  if (setup === "file-upload-size") {
    return {
      tone: "warning" as const,
      text: "Dateien duerfen maximal 50 MB gross sein.",
    };
  }

  if (setup === "file-upload-folder") {
    return {
      tone: "warning" as const,
      text: "Der Ordner passt nicht zur Kategorie oder der Account hat dort kein Upload-Recht.",
    };
  }

  if (setup === "file-upload-category") {
    return {
      tone: "warning" as const,
      text: "Diese Kategorie wurde nicht gefunden oder ist deaktiviert.",
    };
  }

  if (setup === "file-upload-storage") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht in Supabase Storage gespeichert werden.",
    };
  }

  if (setup === "file-upload-permission") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht hochgeladen werden. Der Account hat keine passende Datei-Berechtigung.",
    };
  }

  if (setup === "file-upload-duplicate") {
    return {
      tone: "warning" as const,
      text: "Diese Datei ist bereits unter diesem Speicherpfad registriert.",
    };
  }

  if (setup === "file-upload-error") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht hochgeladen werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "file-download-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Herunterladen von Dateien muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "file-download-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Datei wurde nicht gefunden.",
    };
  }

  if (setup === "file-download-permission") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht heruntergeladen werden. Der Account hat keine passende Download-Berechtigung.",
    };
  }

  if (setup === "file-download-error") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht heruntergeladen werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  return undefined;
}
