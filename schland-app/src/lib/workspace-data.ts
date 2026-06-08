import type { AuthStatus } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MemberStatusLabel = "Aktiv" | "Pruefung" | "Archiv";

export type WorkspaceMember = {
  id: string;
  age: number | null;
  discordId: string;
  discordName: string;
  displayName: string;
  invitedBy: string;
  lastActivity: string;
  linkedFiles: string[];
  messagesMonth: number;
  name: string;
  profession: string;
  residence: string;
  roles: string[];
  status: MemberStatusLabel;
  voiceHoursMonth: number;
};

export type WorkspaceFolder = {
  category: string;
  files: number;
  folder: string;
  id: string;
  uploadFor: string;
  visibleFor: string;
};

export type WorkspaceRoleRow = {
  id: string;
  members: number;
  permissions: string[];
  role: string;
};

export type WorkspaceLogRow = {
  action: string;
  id: string;
  reason: string;
  success: boolean;
  target: string;
  time: string;
  user: string;
};

export type WorkspaceCategory = {
  active: boolean;
  description: string;
  id: string;
  name: string;
  sortOrder: number;
};

export type WorkspaceUserSummary = {
  active: number;
  disabled: number;
  mfaEnabled: number;
};

export type WorkspaceSyncStatus = {
  botState: string;
  errorCount: number;
  lastFullSync: string;
  manualSync: string;
  rows: {
    active: boolean;
    label: string;
    status: string;
  }[];
};

export type WorkspaceData = {
  categories: WorkspaceCategory[];
  folders: WorkspaceFolder[];
  logs: WorkspaceLogRow[];
  members: WorkspaceMember[];
  roles: WorkspaceRoleRow[];
  source: "demo" | "supabase";
  sync: WorkspaceSyncStatus;
  users: WorkspaceUserSummary;
  warning?: string;
};

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

export const demoWorkspaceData: WorkspaceData = {
  source: "demo",
  members: [
    {
      id: "MEM-1007",
      name: "Elias Kramer",
      age: 27,
      residence: "Gera",
      profession: "IT-Service",
      discordId: "842109348219",
      discordName: "elyx",
      displayName: "Elias",
      invitedBy: "Mara Seidel",
      status: "Aktiv",
      lastActivity: "Heute, 00:42",
      roles: ["Mitglied", "Voice Aktiv", "Dateienzugriff"],
      messagesMonth: 418,
      voiceHoursMonth: 38,
      linkedFiles: ["Aufnahmebogen.pdf", "Rollenfreigabe.png"],
    },
    {
      id: "MEM-1042",
      name: "Mara Seidel",
      age: 24,
      residence: "Jena",
      profession: "Medien",
      discordId: "742101095203",
      discordName: "mara.s",
      displayName: "Mara",
      invitedBy: "System",
      status: "Aktiv",
      lastActivity: "Gestern, 22:18",
      roles: ["Moderator", "Ermittlungszugriff", "Mitgliederakten-Leser"],
      messagesMonth: 912,
      voiceHoursMonth: 64,
      linkedFiles: ["Moderationsnotiz.docx"],
    },
    {
      id: "MEM-1099",
      name: "Noah Becker",
      age: 31,
      residence: "Leipzig",
      profession: "Logistik",
      discordId: "663180193355",
      discordName: "nobeck",
      displayName: "Noah",
      invitedBy: "Elias Kramer",
      status: "Pruefung",
      lastActivity: "02.06.2026, 19:04",
      roles: ["Mitglied", "Bilderzugriff"],
      messagesMonth: 73,
      voiceHoursMonth: 9,
      linkedFiles: ["Hinweis-2026-06.pdf"],
    },
  ],
  folders: [
    {
      id: "folder-demo-1",
      category: "Mitteilungen",
      folder: "Interne Rundschreiben",
      visibleFor: "Standardbenutzer",
      uploadFor: "Administrator",
      files: 42,
    },
    {
      id: "folder-demo-2",
      category: "Ermittlungen",
      folder: "Aktive Faelle",
      visibleFor: "Ermittlungszugriff",
      uploadFor: "Ermittlungszugriff",
      files: 31,
    },
    {
      id: "folder-demo-3",
      category: "Gesetzgebung",
      folder: "Regelwerke",
      visibleFor: "Alle aktiven Benutzer",
      uploadFor: "Administrator",
      files: 18,
    },
    {
      id: "folder-demo-4",
      category: "Platzhalter 1",
      folder: "Noch nicht zugeordnet",
      visibleFor: "Administrator",
      uploadFor: "Administrator",
      files: 0,
    },
  ],
  roles: [
    {
      id: "role-demo-1",
      role: "Administrator",
      permissions: ["Benutzer verwalten", "Rollen verwalten", "Dateien loeschen"],
      members: 2,
    },
    {
      id: "role-demo-2",
      role: "Mitgliederakten-Leser",
      permissions: ["Akten suchen", "Akten oeffnen", "Dateiverknuepfungen sehen"],
      members: 4,
    },
    {
      id: "role-demo-3",
      role: "Mitgliederakten-Bearbeiter",
      permissions: ["Akten bearbeiten", "Dateien verknuepfen", "Akten exportieren"],
      members: 3,
    },
    {
      id: "role-demo-4",
      role: "Dateienzugriff",
      permissions: ["Datei-Datenbank anzeigen", "Datei oeffnen", "Datei herunterladen"],
      members: 16,
    },
  ],
  logs: [
    {
      id: "log-demo-1",
      user: "Mara Seidel",
      action: "Mitgliederakte geoeffnet",
      reason: "Moderationsfall pruefen",
      target: "MEM-1007",
      time: "Heute, 00:44",
      success: true,
    },
    {
      id: "log-demo-2",
      user: "Elias Kramer",
      action: "Datei verknuepft",
      reason: "Freigabe dokumentieren",
      target: "MEM-1099",
      time: "Gestern, 21:10",
      success: true,
    },
    {
      id: "log-demo-3",
      user: "Tom Richter",
      action: "Fehlgeschlagener Zugriff",
      reason: "kein Grund",
      target: "MEM-1042",
      time: "Gestern, 18:27",
      success: false,
    },
  ],
  categories: [
    "Mitteilungen",
    "Ermittlungen",
    "Gesetzgebung",
    "Platzhalter 1",
    "Platzhalter 2",
    "Platzhalter 3",
    "Platzhalter 4",
    "Platzhalter 5",
  ].map((name, index) => ({
    id: `category-demo-${index + 1}`,
    name,
    description: "Rechte werden ueber Ordner und Rollen gesteuert.",
    sortOrder: (index + 1) * 10,
    active: true,
  })),
  users: {
    active: 21,
    mfaEnabled: 18,
    disabled: 3,
  },
  sync: {
    lastFullSync: "Noch offen",
    errorCount: 0,
    manualSync: "Adminrecht",
    botState: "nicht gestartet",
    rows: [
      ["Rollen-Sync", "Schema vorbereitet", true],
      ["Neue Mitglieder", "Backend-Endpunkt spaeter", false],
      ["Nachrichtenzaehler", "Monatsmodell vorbereitet", true],
      ["Voice-Sessions", "Tabellen vorbereitet", true],
      ["Bot-Implementierung", "Zum Schluss", false],
    ].map(([label, status, active]) => ({
      label: String(label),
      status: String(status),
      active: Boolean(active),
    })),
  },
};

export async function getWorkspaceData(
  authStatus: AuthStatus,
): Promise<WorkspaceData> {
  if (!hasSupabasePublicEnv() || !authStatus.signedIn) {
    return demoWorkspaceData;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const warnings: string[] = [];

    const [
      membersResult,
      categoriesResult,
      foldersResult,
      rolesResult,
      profilesResult,
      logsResult,
      syncResult,
    ] = await Promise.all([
      supabase
        .from("members")
        .select(
          `
            id,
            name,
            age,
            residence,
            profession,
            discord_id,
            discord_username,
            discord_display_name,
            status,
            updated_at,
            invited_by:invited_by_member_id(name),
            message_activity_monthly(year, month, message_count, last_message_at),
            voice_activity_monthly(year, month, voice_minutes, last_voice_at),
            member_discord_roles(discord_roles(role_name)),
            member_files(files(filename, original_filename))
          `,
        )
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("file_categories")
        .select("id, name, description, sort_order, active")
        .order("sort_order", { ascending: true }),
      supabase
        .from("folders")
        .select(
          `
            id,
            name,
            file_categories(name),
            files(id),
            folder_permissions(
              can_view,
              can_upload,
              roles(name)
            )
          `,
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("roles")
        .select(
          `
            id,
            name,
            role_permissions(permissions(description)),
            user_roles(user_id)
          `,
        )
        .order("name", { ascending: true }),
      supabase.from("profiles").select("id, status, two_factor_enabled"),
      supabase
        .from("member_case_logs")
        .select("id, username, action, reason, success, created_at, member_id")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("sync_runs")
        .select("id, status, started_at, finished_at, error_message, metadata")
        .order("started_at", { ascending: false })
        .limit(5),
    ]);

    collectWarning(warnings, membersResult.error?.message);
    collectWarning(warnings, categoriesResult.error?.message);
    collectWarning(warnings, foldersResult.error?.message);
    collectWarning(warnings, rolesResult.error?.message);
    collectWarning(warnings, profilesResult.error?.message);
    collectWarning(warnings, logsResult.error?.message);
    collectWarning(warnings, syncResult.error?.message);

    return {
      source: "supabase",
      members: mapMembers(membersResult.data ?? []),
      categories: mapCategories(categoriesResult.data ?? []),
      folders: mapFolders(foldersResult.data ?? []),
      roles: mapRoles(rolesResult.data ?? []),
      users: mapUsers(profilesResult.data ?? []),
      logs: mapLogs(logsResult.data ?? []),
      sync: mapSync(syncResult.data ?? []),
      warning: warnings[0],
    };
  } catch (error) {
    return {
      ...demoWorkspaceData,
      warning: error instanceof Error ? error.message : "Supabase Fehler",
    };
  }
}

function collectWarning(warnings: string[], message?: string) {
  if (message && !warnings.includes(message)) {
    warnings.push(message);
  }
}

function mapMembers(rows: Record<string, unknown>[]): WorkspaceMember[] {
  return rows.map((row) => {
    const messageRows = asArray(row.message_activity_monthly);
    const voiceRows = asArray(row.voice_activity_monthly);
    const currentMessageRow = messageRows.find(
      (activity) =>
        Number(activity.year) === currentYear && Number(activity.month) === currentMonth,
    );
    const currentVoiceRow = voiceRows.find(
      (activity) =>
        Number(activity.year) === currentYear && Number(activity.month) === currentMonth,
    );
    const lastActivityAt =
      String(currentVoiceRow?.last_voice_at ?? "") ||
      String(currentMessageRow?.last_message_at ?? "") ||
      String(row.updated_at ?? "");

    return {
      id: String(row.id ?? ""),
      name: String(row.name ?? "Unbenannt"),
      age: row.age === null || row.age === undefined ? null : Number(row.age),
      residence: String(row.residence ?? "-"),
      profession: String(row.profession ?? "-"),
      discordId: String(row.discord_id ?? "-"),
      discordName: String(row.discord_username ?? "-"),
      displayName: String(row.discord_display_name ?? row.discord_username ?? "-"),
      invitedBy: String(asObject(row.invited_by)?.name ?? "-"),
      status: mapMemberStatus(String(row.status ?? "active")),
      lastActivity: formatDate(lastActivityAt),
      roles: asArray(row.member_discord_roles)
        .map((entry) => String(asObject(entry.discord_roles)?.role_name ?? ""))
        .filter(Boolean),
      messagesMonth: Number(currentMessageRow?.message_count ?? 0),
      voiceHoursMonth: Math.round(Number(currentVoiceRow?.voice_minutes ?? 0) / 60),
      linkedFiles: asArray(row.member_files)
        .map((entry) => {
          const file = asObject(entry.files);
          return String(file.original_filename ?? file.filename ?? "");
        })
        .filter(Boolean),
    };
  });
}

function mapCategories(rows: Record<string, unknown>[]): WorkspaceCategory[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? "Kategorie"),
    description: String(row.description ?? "Rechte werden ueber Ordner gesteuert."),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active ?? true),
  }));
}

function mapFolders(rows: Record<string, unknown>[]): WorkspaceFolder[] {
  return rows.map((row) => {
    const permissions = asArray(row.folder_permissions);
    const viewRoles = permissions
      .filter((permission) => Boolean(permission.can_view))
      .map((permission) => String(asObject(permission.roles)?.name ?? ""))
      .filter(Boolean);
    const uploadRoles = permissions
      .filter((permission) => Boolean(permission.can_upload))
      .map((permission) => String(asObject(permission.roles)?.name ?? ""))
      .filter(Boolean);

    return {
      id: String(row.id ?? ""),
      category: String(asObject(row.file_categories)?.name ?? "-"),
      folder: String(row.name ?? "Ordner"),
      visibleFor: viewRoles.join(", ") || "Nicht gesetzt",
      uploadFor: uploadRoles.join(", ") || "Nicht gesetzt",
      files: asArray(row.files).length,
    };
  });
}

function mapRoles(rows: Record<string, unknown>[]): WorkspaceRoleRow[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    role: String(row.name ?? "Rolle"),
    permissions: asArray(row.role_permissions)
      .map((entry) => String(asObject(entry.permissions)?.description ?? ""))
      .filter(Boolean),
    members: asArray(row.user_roles).length,
  }));
}

function mapUsers(rows: Record<string, unknown>[]): WorkspaceUserSummary {
  return rows.reduce<WorkspaceUserSummary>(
    (summary, row) => {
      if (row.status === "disabled") {
        summary.disabled += 1;
      } else {
        summary.active += 1;
      }

      if (row.two_factor_enabled) {
        summary.mfaEnabled += 1;
      }

      return summary;
    },
    { active: 0, disabled: 0, mfaEnabled: 0 },
  );
}

function mapLogs(rows: Record<string, unknown>[]): WorkspaceLogRow[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    user: String(row.username ?? "Unbekannt"),
    action: mapLogAction(String(row.action ?? "view")),
    reason: String(row.reason ?? "-"),
    target: String(row.member_id ?? "-"),
    time: formatDate(String(row.created_at ?? "")),
    success: Boolean(row.success),
  }));
}

function mapSync(rows: Record<string, unknown>[]): WorkspaceSyncStatus {
  const latest = rows[0];
  const errors = rows.filter((row) => Boolean(row.error_message)).length;

  return {
    lastFullSync: latest ? formatDate(String(latest.started_at ?? "")) : "Noch offen",
    errorCount: errors,
    manualSync: "Adminrecht",
    botState: latest ? String(latest.status ?? "unbekannt") : "nicht gestartet",
    rows: [
      {
        label: "Rollen-Sync",
        status: latest ? "Letzter Lauf vorhanden" : "Schema vorbereitet",
        active: true,
      },
      {
        label: "Neue Mitglieder",
        status: "Backend vorbereitet",
        active: true,
      },
      {
        label: "Nachrichtenzaehler",
        status: "Monatsmodell vorbereitet",
        active: true,
      },
      {
        label: "Voice-Sessions",
        status: "Tabellen vorbereitet",
        active: true,
      },
      {
        label: "Bot-Implementierung",
        status: "Zum Schluss",
        active: false,
      },
    ],
  };
}

function mapMemberStatus(status: string): MemberStatusLabel {
  if (status === "review") {
    return "Pruefung";
  }

  if (status === "archived") {
    return "Archiv";
  }

  return "Aktiv";
}

function mapLogAction(action: string) {
  const labels: Record<string, string> = {
    create: "Mitgliederakte angelegt",
    search: "Mitgliederakte gesucht",
    open: "Mitgliederakte geoeffnet",
    view: "Mitgliederakte angezeigt",
    edit: "Mitgliederakte bearbeitet",
    clear_field: "Feld geleert",
    link_file: "Datei verknuepft",
    unlink_file: "Datei entfernt",
    open_linked_file: "Aktendatei geoeffnet",
    export: "Mitgliederakte exportiert",
    failed_access: "Fehlgeschlagener Zugriff",
  };

  return labels[action] ?? action;
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
