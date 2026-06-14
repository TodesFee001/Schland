import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthStatus } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getEnvironmentStatus } from "@/lib/env";
import { getWorkspaceData } from "@/lib/workspace-data";
import { redirect } from "next/navigation";

type HomeProps = {
  searchParams: Promise<{
    advice?: string;
    member?: string;
    section?: string;
    setup?: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      initialSelectedAdviceCaseId={params.advice}
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
      text: "Es gibt bereits einen Root Owner. Der Erststart ist damit geschlossen.",
    };
  }

  if (setup === "admin-claim-error") {
    return {
      tone: "error" as const,
      text: "Root Owner und Administrator konnten nicht aktiviert werden. Bitte Supabase-Benutzer und Migrationen pruefen.",
    };
  }

  if (setup === "missing-supabase") {
    return {
      tone: "error" as const,
      text: "Supabase ist noch nicht verbunden.",
    };
  }

  if (setup === "absence-started") {
    return {
      tone: "success" as const,
      text: "Abmeldung wurde angelegt. Der Discord-Bot setzt die passenden Amtsvertretungen.",
    };
  }

  if (setup === "absence-started-no-roles") {
    return {
      tone: "warning" as const,
      text: "Abmeldung wurde angelegt. Fuer diese Person ist keine konfigurierte Amtsrolle betroffen.",
    };
  }

  if (setup === "absence-ending") {
    return {
      tone: "success" as const,
      text: "Rueckkehr wurde gespeichert. Der Bot entfernt automatisch gesetzte Vertretungsrollen.",
    };
  }

  if (setup === "absence-ended") {
    return {
      tone: "success" as const,
      text: "Abmeldung wurde beendet.",
    };
  }

  if (setup === "absence-aal2") {
    return {
      tone: "warning" as const,
      text: "Abmeldungen und Amtsvertretungen brauchen eine aktive 2FA-Sitzung.",
    };
  }

  if (setup === "absence-reason" || setup === "absence-end-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "absence-member" || setup === "absence-end-missing") {
    return {
      tone: "warning" as const,
      text: "Die ausgewaehlte Abmeldung oder Mitgliederakte wurde nicht gefunden.",
    };
  }

  if (setup === "absence-discord") {
    return {
      tone: "warning" as const,
      text: "Diese Mitgliederakte hat keine gueltige Discord-ID.",
    };
  }

  if (setup === "absence-off-server") {
    return {
      tone: "warning" as const,
      text: "Diese Person ist aktuell nicht auf dem Discord-Server.",
    };
  }

  if (setup === "absence-already-active") {
    return {
      tone: "warning" as const,
      text: "Fuer diese Person laeuft bereits eine Abmeldung.",
    };
  }

  if (setup === "absence-denied") {
    return {
      tone: "error" as const,
      text: "Abmeldung wurde abgelehnt. Dem Account fehlt der Verwaltungszugang.",
    };
  }

  if (setup === "absence-error") {
    return {
      tone: "error" as const,
      text: "Abmeldung konnte nicht gespeichert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "ministry-role-created" || setup === "ministry-role-saved") {
    return {
      tone: "success" as const,
      text: "Amtsrolle wurde gespeichert.",
    };
  }

  if (setup === "ministry-role-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Aendern von Amtsrollen muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "ministry-role-missing") {
    return {
      tone: "warning" as const,
      text: "Bitte waehle eine Discord-Rolle und gib einen Namen an.",
    };
  }

  if (setup === "ministry-role-denied") {
    return {
      tone: "error" as const,
      text: "Amtsrolle konnte nicht geaendert werden. Dem Account fehlt die Vertretungsverwaltung.",
    };
  }

  if (setup === "ministry-role-error") {
    return {
      tone: "error" as const,
      text: "Amtsrolle konnte nicht gespeichert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (
    setup === "representation-eligibility-created" ||
    setup === "representation-eligibility-saved"
  ) {
    return {
      tone: "success" as const,
      text: "Vertretungsberechtigung wurde gespeichert.",
    };
  }

  if (setup === "representation-eligibility-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Aendern von Vertretungsberechtigungen muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "representation-eligibility-missing") {
    return {
      tone: "warning" as const,
      text: "Bitte waehle ein Mitglied fuer die Vertretung aus.",
    };
  }

  if (setup === "representation-eligibility-roles") {
    return {
      tone: "warning" as const,
      text: "Bitte waehle mindestens eine Amtsrolle fuer diese Vertretung aus.",
    };
  }

  if (setup === "representation-eligibility-discord") {
    return {
      tone: "warning" as const,
      text: "Das ausgewaehlte Mitglied hat keine gueltige Discord-ID.",
    };
  }

  if (setup === "representation-eligibility-denied") {
    return {
      tone: "error" as const,
      text: "Vertretungsberechtigung konnte nicht geaendert werden. Dem Account fehlt die Vertretungsverwaltung.",
    };
  }

  if (setup === "representation-eligibility-error") {
    return {
      tone: "error" as const,
      text: "Vertretungsberechtigung konnte nicht gespeichert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "lockdown-activated") {
    return {
      tone: "success" as const,
      text: "Lockdown wurde aktiviert. Der Notfallschluessel wird per Discord-DM zugestellt.",
    };
  }

  if (setup === "lockdown-deactivated") {
    return {
      tone: "success" as const,
      text: "Lockdown wurde deaktiviert. Der Bot stellt die Discord-Rechte wieder her.",
    };
  }

  if (setup === "lockdown-aal2") {
    return {
      tone: "warning" as const,
      text: "Lockdown-Aktionen brauchen eine aktive 2FA-Sitzung.",
    };
  }

  if (setup === "lockdown-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib einen Lockdown-Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "lockdown-failed") {
    return {
      tone: "error" as const,
      text: "Lockdown-Aktion konnte nicht angelegt werden. Rechte, 2FA oder Bot-Status pruefen.",
    };
  }

  if (setup === "lockdown-bot-offline") {
    return {
      tone: "error" as const,
      text: "Lockdown wurde blockiert, weil der Discord-Bot kein frisches Live-Signal sendet.",
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

  if (setup === "member-avatar-uploaded") {
    return {
      tone: "success" as const,
      text: "Profilbild wurde hochgeladen und in der Mitgliederakte gesetzt.",
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

  if (setup === "member-avatar-missing") {
    return {
      tone: "warning" as const,
      text: "Mitgliederakte oder Profilbild-Datei wurde nicht gefunden.",
    };
  }

  if (setup === "member-avatar-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer das Profilbild einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "member-avatar-size") {
    return {
      tone: "warning" as const,
      text: "Profilbilder duerfen maximal 8 MB gross sein.",
    };
  }

  if (setup === "member-avatar-type") {
    return {
      tone: "warning" as const,
      text: "Bitte lade ein Profilbild als PNG, JPG, WebP, GIF oder AVIF hoch.",
    };
  }

  if (setup === "member-avatar-storage") {
    return {
      tone: "error" as const,
      text: "Profilbild konnte nicht in Supabase Storage gespeichert werden.",
    };
  }

  if (setup === "member-avatar-error") {
    return {
      tone: "error" as const,
      text: "Profilbild konnte nicht gesetzt werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "moderation-event-updated") {
    return {
      tone: "success" as const,
      text: "Strafe oder Warn wurde in der Mitgliederakte angepasst und protokolliert.",
    };
  }

  if (setup === "moderation-event-deleted") {
    return {
      tone: "success" as const,
      text: "Strafe oder Warn wurde aus der Mitgliederakte entfernt und protokolliert.",
    };
  }

  if (setup === "moderation-event-missing") {
    return {
      tone: "warning" as const,
      text: "Dieser Moderationseintrag wurde nicht gefunden oder gehoert nicht zu dieser Akte.",
    };
  }

  if (setup === "moderation-event-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer die Aenderung einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "moderation-event-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Bearbeiten von Strafen muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "moderation-event-denied") {
    return {
      tone: "error" as const,
      text: "Strafe konnte nicht geaendert werden. Der Account hat keine Moderations-Berechtigung.",
    };
  }

  if (setup === "moderation-event-running") {
    return {
      tone: "warning" as const,
      text: "Dieser Bot-Auftrag laeuft noch und kann erst nach der Ausfuehrung angepasst werden.",
    };
  }

  if (setup === "moderation-event-failed") {
    return {
      tone: "error" as const,
      text: "Strafe konnte nicht geaendert werden. Der genaue Fehler wurde protokolliert.",
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

  if (setup === "member-updated") {
    return {
      tone: "success" as const,
      text: "Mitgliederakte wurde gespeichert und protokolliert.",
    };
  }

  if (setup === "member-update-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Bearbeiten einer Mitgliederakte muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "member-update-name") {
    return {
      tone: "warning" as const,
      text: "Bitte gib einen Namen fuer die Mitgliederakte an.",
    };
  }

  if (setup === "member-update-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer die Aenderung einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "member-update-age") {
    return {
      tone: "warning" as const,
      text: "Das Alter darf nicht negativ sein.",
    };
  }

  if (setup === "member-update-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Mitgliederakte wurde nicht gefunden.",
    };
  }

  if (setup === "member-update-permission") {
    return {
      tone: "error" as const,
      text: "Mitgliederakte konnte nicht bearbeitet werden. Dem Account fehlt die passende Berechtigung.",
    };
  }

  if (setup === "member-update-duplicate") {
    return {
      tone: "warning" as const,
      text: "Diese Discord-ID ist bereits in einer anderen Mitgliederakte hinterlegt.",
    };
  }

  if (setup === "member-update-error") {
    return {
      tone: "error" as const,
      text: "Mitgliederakte konnte nicht bearbeitet werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "member-deleted") {
    return {
      tone: "success" as const,
      text: "Mitgliederakte wurde geloescht und der Vorgang wurde protokolliert.",
    };
  }

  if (setup === "member-delete-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Loeschen einer Mitgliederakte muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "member-delete-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer das Loeschen einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "member-delete-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Mitgliederakte wurde nicht gefunden.",
    };
  }

  if (setup === "member-delete-permission") {
    return {
      tone: "error" as const,
      text: "Mitgliederakte konnte nicht geloescht werden. Dem Account fehlt die passende Berechtigung.",
    };
  }

  if (setup === "member-delete-error") {
    return {
      tone: "error" as const,
      text: "Mitgliederakte konnte nicht geloescht werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "discord-invite-created") {
    return {
      tone: "success" as const,
      text: "Discord-Einladung wurde als Datenbankauftrag angelegt. Railway erstellt Link und DM automatisch.",
    };
  }

  if (setup === "discord-invite-pending") {
    return {
      tone: "warning" as const,
      text: "Discord-Einladung wurde als Datenbankauftrag angelegt. Railway verarbeitet sie automatisch.",
    };
  }

  if (setup === "discord-invite-live-failed") {
    return {
      tone: "error" as const,
      text: "Discord-Einladung wurde gespeichert, aber Link-Erstellung oder Discord-DM ist fehlgeschlagen. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "discord-invite-deleted") {
    return {
      tone: "success" as const,
      text: "Discord-Einladung wurde geloescht. Ein vorhandener Discord-Link wurde widerrufen, sofern Discord das erlaubt hat.",
    };
  }

  if (setup === "discord-invite-delete-missing") {
    return {
      tone: "warning" as const,
      text: "Die Discord-Einladung wurde nicht gefunden.",
    };
  }

  if (setup === "discord-invite-delete-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Loeschen einer Discord-Einladung muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "discord-invite-delete-denied") {
    return {
      tone: "error" as const,
      text: "Discord-Einladung konnte nicht geloescht werden. Dem Account fehlt die passende Berechtigung.",
    };
  }

  if (setup === "discord-invite-delete-failed") {
    return {
      tone: "error" as const,
      text: "Discord-Einladung konnte nicht geloescht werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "discord-sync-ran") {
    return {
      tone: "success" as const,
      text: "Discord-Sync wurde ausgefuehrt. Einladungen und Moderationsregister sind aktualisiert.",
    };
  }

  if (setup === "discord-live-refresh") {
    return {
      tone: "success" as const,
      text: "Ansicht aktualisiert. Der Railway-Bot synchronisiert automatisch im Hintergrund.",
    };
  }

  if (setup === "discord-sync-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum manuellen Discord-Sync muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "discord-sync-denied") {
    return {
      tone: "error" as const,
      text: "Discord-Live-Sync wurde abgelehnt. Dem Account fehlt die passende Sync- oder Einladungsberechtigung.",
    };
  }

  if (setup === "discord-sync-failed") {
    return {
      tone: "error" as const,
      text: "Discord-Sync konnte nicht ausgefuehrt werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "moderation-action-done") {
    return {
      tone: "success" as const,
      text: "Moderationsaktion wurde ausgefuehrt und im Register gespeichert.",
    };
  }

  if (setup === "moderation-action-missing") {
    return {
      tone: "warning" as const,
      text: "Bitte waehle Mitglied und Moderationsaktion aus.",
    };
  }

  if (setup === "moderation-action-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer die Moderationsaktion einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "moderation-action-duration") {
    return {
      tone: "warning" as const,
      text: "Timeout/Mute braucht eine Dauer in Minuten.",
    };
  }

  if (setup === "moderation-action-timeout-lifetime") {
    return {
      tone: "warning" as const,
      text: "Discord erlaubt native Timeouts nicht als Lifetime. Bitte fuer Mute/Timeout Minuten eintragen; Bans werden dauerhaft gesetzt.",
    };
  }

  if (setup === "moderation-action-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Ausfuehren von Moderation muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "moderation-action-denied") {
    return {
      tone: "error" as const,
      text: "Moderationsaktion wurde abgelehnt. Dem Account fehlt die passende Berechtigung.",
    };
  }

  if (setup === "moderation-action-failed") {
    return {
      tone: "error" as const,
      text: "Moderationsaktion konnte nicht ausgefuehrt werden. Bot-Rechte und Discord-Ziel pruefen.",
    };
  }

  if (setup === "advice-created") {
    return {
      tone: "success" as const,
      text: "Beratung wurde angelegt und mit Aktenzeichen gespeichert.",
    };
  }

  if (setup === "advice-ready") {
    return {
      tone: "success" as const,
      text: "KI-Auswertung wurde gespeichert. Die Empfehlung wartet auf menschliche Pruefung.",
    };
  }

  if (setup === "advice-saved" || setup === "advice-title-saved") {
    return {
      tone: "success" as const,
      text: "Beratungsfall wurde gespeichert.",
    };
  }

  if (setup === "advice-queued") {
    return {
      tone: "success" as const,
      text: "Bot-Auftrag wurde aus der Beratung erstellt. Der Railway-Bot meldet Erfolg oder Fehler zurueck.",
    };
  }

  if (setup === "advice-aal2") {
    return {
      tone: "warning" as const,
      text: "KI-Beratungen und Freigaben brauchen eine aktive 2FA-Sitzung.",
    };
  }

  if (setup === "advice-denied") {
    return {
      tone: "error" as const,
      text: "Dem Account fehlt die Moderationsverwaltung.",
    };
  }

  if (setup === "advice-target") {
    return {
      tone: "warning" as const,
      text: "Bitte waehle eine Zielperson oder gib eine gueltige Discord-ID beziehungsweise einen Namen an.",
    };
  }

  if (setup === "advice-description") {
    return {
      tone: "warning" as const,
      text: "Bitte beschreibe Situation und konkretes Verhalten ausreichend.",
    };
  }

  if (setup === "advice-upload-size") {
    return {
      tone: "warning" as const,
      text: "Belege duerfen pro Datei maximal 20 MB gross sein.",
    };
  }

  if (setup === "advice-upload-count") {
    return {
      tone: "warning" as const,
      text: "Bitte lade maximal 20 Belegdateien pro Beratung hoch.",
    };
  }

  if (setup === "advice-upload-total") {
    return {
      tone: "warning" as const,
      text: "Die ausgewaehlten Belege sind zusammen zu gross. Bitte maximal 45 MB pro Beratung hochladen.",
    };
  }

  if (setup === "advice-upload-type") {
    return {
      tone: "warning" as const,
      text: "Erlaubt sind Bilder, PDF und einfache Textdateien.",
    };
  }

  if (setup === "advice-title") {
    return {
      tone: "warning" as const,
      text: "Der Beratungstitel muss zwischen 2 und 140 Zeichen lang sein.",
    };
  }

  if (setup === "advice-execute-failed") {
    return {
      tone: "error" as const,
      text: "Ausfuehrung wurde blockiert. Rechte, Discord-ID, Empfehlung oder bestehende Bot-Queue pruefen.",
    };
  }

  if (setup === "advice-error" || setup === "advice-missing") {
    return {
      tone: "error" as const,
      text: "Beratung konnte nicht verarbeitet werden. Details stehen im Serverprotokoll.",
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
      text: "Bitte gib die Discord User-ID der Person ein.",
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
      text: "Der letzte Root Owner oder Administrator kann nicht entfernt werden.",
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

  if (setup === "two-factor-requirement-enabled") {
    return {
      tone: "success" as const,
      text: "2FA-Pflicht wurde fuer diesen Benutzer wieder aktiviert.",
    };
  }

  if (setup === "two-factor-requirement-disabled") {
    return {
      tone: "success" as const,
      text: "2FA-Pflicht wurde fuer diesen Benutzer deaktiviert.",
    };
  }

  if (setup === "two-factor-requirement-denied") {
    return {
      tone: "error" as const,
      text: "2FA-Pflicht konnte nicht geaendert werden. Nur Root Owner duerfen das.",
    };
  }

  if (setup === "two-factor-requirement-missing") {
    return {
      tone: "warning" as const,
      text: "Benutzer oder 2FA-Zielzustand wurde nicht gefunden.",
    };
  }

  if (setup === "two-factor-requirement-error") {
    return {
      tone: "error" as const,
      text: "2FA-Pflicht konnte nicht geaendert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "category-created") {
    return {
      tone: "success" as const,
      text: "Kategorie wurde angelegt.",
    };
  }

  if (setup === "category-saved") {
    return {
      tone: "success" as const,
      text: "Kategorie wurde gespeichert.",
    };
  }

  if (setup === "category-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Aendern von Kategorien muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "category-name") {
    return {
      tone: "warning" as const,
      text: "Bitte gib einen Kategorienamen mit mindestens 2 Zeichen an.",
    };
  }

  if (setup === "category-permission") {
    return {
      tone: "error" as const,
      text: "Kategorie konnte nicht geaendert werden. Dem Account fehlt die passende Berechtigung.",
    };
  }

  if (setup === "category-duplicate") {
    return {
      tone: "warning" as const,
      text: "Eine Kategorie mit diesem Namen existiert bereits.",
    };
  }

  if (setup === "category-error") {
    return {
      tone: "error" as const,
      text: "Kategorie konnte nicht geaendert werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "role-created") {
    return {
      tone: "success" as const,
      text: "Rolle wurde angelegt.",
    };
  }

  if (setup === "role-saved") {
    return {
      tone: "success" as const,
      text: "Rolle wurde gespeichert.",
    };
  }

  if (setup === "role-permission-added") {
    return {
      tone: "success" as const,
      text: "Berechtigung wurde der Rolle hinzugefuegt.",
    };
  }

  if (setup === "role-permission-removed") {
    return {
      tone: "success" as const,
      text: "Berechtigung wurde aus der Rolle entfernt.",
    };
  }

  if (setup === "role-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Aendern von Rollen und Rechten muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "role-name" || setup === "role-key") {
    return {
      tone: "warning" as const,
      text: "Bitte gib Rollenname und Rollenschluessel an.",
    };
  }

  if (setup === "role-permission-missing") {
    return {
      tone: "warning" as const,
      text: "Rolle oder Berechtigung wurde nicht gefunden.",
    };
  }

  if (setup === "role-admin-core") {
    return {
      tone: "warning" as const,
      text: "Kernrechte von Root Owner oder Administrator bleiben aktiv.",
    };
  }

  if (setup === "role-permission") {
    return {
      tone: "error" as const,
      text: "Rolle konnte nicht geaendert werden. Dem Account fehlt die passende Berechtigung.",
    };
  }

  if (setup === "role-duplicate") {
    return {
      tone: "warning" as const,
      text: "Eine Rolle mit diesem Namen oder Schluessel existiert bereits.",
    };
  }

  if (setup === "role-error") {
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
      text: "Datei wurde hochgeladen, gespeichert und fuer Google Drive vorgemerkt.",
    };
  }

  if (setup === "file-uploaded-drive-pending") {
    return {
      tone: "warning" as const,
      text: "Datei wurde gespeichert. Google Drive ist noch nicht konfiguriert oder der Upload wird beim naechsten Sync nachgezogen.",
    };
  }

  if (setup === "file-upload-partial") {
    return {
      tone: "warning" as const,
      text: "Mehrfach-Upload teilweise abgeschlossen. Einzelne Dateien sind fehlgeschlagen und wurden nicht ueberschrieben.",
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

  if (setup === "file-open-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum direkten Oeffnen von Dateien muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "file-open-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Datei wurde nicht gefunden.",
    };
  }

  if (setup === "file-open-permission") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht geoeffnet werden. Dem Account fehlt die passende Datei- oder Ordner-Berechtigung.",
    };
  }

  if (setup === "file-open-error") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht direkt geoeffnet werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "file-moved") {
    return {
      tone: "success" as const,
      text: "Datei wurde verschoben.",
    };
  }

  if (setup === "file-move-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Verschieben von Dateien muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "file-move-missing") {
    return {
      tone: "warning" as const,
      text: "Datei oder Zielkategorie wurde nicht gefunden.",
    };
  }

  if (setup === "file-move-folder") {
    return {
      tone: "warning" as const,
      text: "Der Zielordner wurde nicht gefunden.",
    };
  }

  if (setup === "file-move-category") {
    return {
      tone: "warning" as const,
      text: "Die Zielkategorie wurde nicht gefunden oder ist deaktiviert.",
    };
  }

  if (setup === "file-move-permission") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht verschoben werden. Dem Account fehlt die passende Datei- oder Ordner-Berechtigung.",
    };
  }

  if (setup === "file-move-error") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht verschoben werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "file-deleted") {
    return {
      tone: "success" as const,
      text: "Datei wurde sicher markiert. Es wurde nichts hart aus Storage oder Google Drive geloescht.",
    };
  }

  if (setup === "file-delete-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Loeschen von Dateien muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "file-delete-missing") {
    return {
      tone: "warning" as const,
      text: "Diese Datei wurde nicht gefunden.",
    };
  }

  if (setup === "file-delete-reason") {
    return {
      tone: "warning" as const,
      text: "Bitte gib fuer das Loeschen einen Grund mit mindestens 8 Zeichen an.",
    };
  }

  if (setup === "file-delete-permission") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht geloescht werden. Dem Account fehlt die passende Datei- oder Ordner-Berechtigung.",
    };
  }

  if (setup === "file-delete-storage") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht aus Supabase Storage geloescht werden.",
    };
  }

  if (setup === "file-delete-error") {
    return {
      tone: "error" as const,
      text: "Datei konnte nicht geloescht werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  if (setup === "drive-sync-started") {
    return {
      tone: "success" as const,
      text: "Google-Drive-Sync wurde ausgefuehrt. Konflikte werden im Datei-Bereich angezeigt.",
    };
  }

  if (setup === "drive-sync-partial") {
    return {
      tone: "warning" as const,
      text: "Google-Drive-Sync wurde teilweise ausgefuehrt. Offene Konflikte stehen im Datei-Bereich.",
    };
  }

  if (setup === "drive-sync-running") {
    return {
      tone: "warning" as const,
      text: "Es laeuft bereits ein Google-Drive-Sync. Ein zweiter Lauf wurde sicher uebersprungen.",
    };
  }

  if (setup === "drive-sync-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Starten des Google-Drive-Syncs muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "drive-sync-denied") {
    return {
      tone: "error" as const,
      text: "Google-Drive-Sync wurde abgelehnt. Dem Account fehlt die Sync- oder Datei-Verwaltung.",
    };
  }

  if (setup === "drive-sync-failed") {
    return {
      tone: "error" as const,
      text: "Google-Drive-Sync ist fehlgeschlagen. Details stehen im Sync-Protokoll.",
    };
  }

  if (setup === "google-doc-missing") {
    return {
      tone: "warning" as const,
      text: "Bitte gib Dokumentname und Zielordner an.",
    };
  }

  if (setup === "google-doc-aal2") {
    return {
      tone: "warning" as const,
      text: "Zum Erstellen von Google Docs muss die aktuelle Sitzung mit 2FA freigeschaltet sein.",
    };
  }

  if (setup === "google-doc-drive-config") {
    return {
      tone: "error" as const,
      text: "Google Drive ist serverseitig noch nicht konfiguriert.",
    };
  }

  if (setup === "google-doc-duplicate") {
    return {
      tone: "warning" as const,
      text: "In diesem Ordner existiert bereits ein Dokument mit diesem Namen.",
    };
  }

  if (setup === "google-doc-folder") {
    return {
      tone: "warning" as const,
      text: "Der Zielordner wurde nicht gefunden oder ist noch nicht sauber verknuepft.",
    };
  }

  if (setup === "google-doc-denied") {
    return {
      tone: "error" as const,
      text: "Google Docs konnte nicht erstellt werden. Dem Account fehlt die passende Datei- oder Ordner-Berechtigung.",
    };
  }

  if (setup === "google-doc-error") {
    return {
      tone: "error" as const,
      text: "Google Docs konnte nicht erstellt werden. Der genaue Fehler wurde protokolliert.",
    };
  }

  return undefined;
}
