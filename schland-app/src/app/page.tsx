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

  return undefined;
}
