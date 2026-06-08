import type { AuthStatus } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MemberStatusLabel = "Aktiv" | "Pruefung" | "Archiv";

export type WorkspaceMember = {
  id: string;
  age: number | null;
  discordAnalyticsDisabledAt: string;
  discordAnalyticsDisabledReason: string;
  discordAnalyticsEnabled: boolean;
  discordId: string;
  discordJoinedAt: string;
  discordLastSeenAt: string;
  discordName: string;
  discordOnServer: boolean;
  displayName: string;
  ea: string;
  instagram: string;
  invitedBy: string;
  lastActivity: string;
  linkedFiles: WorkspaceMemberFile[];
  messagesMonth: number;
  name: string;
  notes: string;
  phone: string;
  profession: string;
  residence: string;
  roles: string[];
  snapchat: string;
  status: MemberStatusLabel;
  statusKey: "active" | "archived" | "review";
  stream: string;
  tiktok: string;
  ubisoft: string;
  voiceHoursMonth: number;
};

export type WorkspaceMemberFile = {
  createdAt: string;
  fileId: string;
  name: string;
  relationType: string;
  sizeLabel: string;
  type: string;
};

export type WorkspaceFolder = {
  category: string;
  categoryId: string;
  files: number;
  folder: string;
  id: string;
  parentFolderId: string;
  permissions: WorkspaceFolderPermission[];
  uploadFor: string;
  visibleFor: string;
};

export type WorkspaceFolderPermission = {
  canDelete: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canManagePermissions: boolean;
  canOpen: boolean;
  canUpload: boolean;
  canView: boolean;
  role: string;
  roleId: string;
  roleKey: string;
};

export type WorkspaceFile = {
  category: string;
  categoryId: string;
  createdAt: string;
  description: string;
  folder: string;
  folderId: string;
  id: string;
  name: string;
  originalName: string;
  size: number;
  sizeLabel: string;
  storagePath: string;
  tags: string[];
  type: string;
  uploadedBy: string;
};

export type WorkspaceRoleRow = {
  active: boolean;
  description: string;
  id: string;
  members: number;
  permissions: string[];
  permissionsDetailed: WorkspacePermissionOption[];
  role: string;
  roleKey: string;
};

export type WorkspacePermissionOption = {
  description: string;
  id: string;
  key: string;
};

export type WorkspaceDiscordInvite = {
  botError: string;
  createdAt: string;
  dmError: string;
  dmSentAt: string;
  dmStatus: string;
  discordInviteCode: string;
  discordInviteUrl: string;
  expiresAt: string;
  id: string;
  inviteeDiscordId: string;
  inviteeName: string;
  maxUses: number;
  permission: string;
  permissionKey: string;
  reason: string;
  requestedBy: string;
  status: string;
  statusLabel: string;
  targetDiscordId: string;
  targetMemberName: string;
  uses: number;
};

export type WorkspaceModerationEvent = {
  channel: string;
  discordId: string;
  discordName: string;
  endedAt: string;
  eventType: string;
  eventTypeLabel: string;
  id: string;
  memberName: string;
  moderator: string;
  reason: string;
  remainingDuration: string;
  startedAt: string;
  status: string;
  statusLabel: string;
  totalDuration: string;
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

export type WorkspaceUserRole = {
  id: string;
  role: string;
  roleKey: string;
};

export type WorkspaceUserRow = {
  displayName: string;
  email: string;
  id: string;
  roles: WorkspaceUserRole[];
  status: string;
  statusLabel: string;
  twoFactorEnabled: boolean;
  username: string;
};

export type WorkspaceUserSummary = {
  active: number;
  disabled: number;
  mfaEnabled: number;
  rows: WorkspaceUserRow[];
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
  discordInvites: WorkspaceDiscordInvite[];
  files: WorkspaceFile[];
  folders: WorkspaceFolder[];
  logs: WorkspaceLogRow[];
  members: WorkspaceMember[];
  moderationEvents: WorkspaceModerationEvent[];
  permissions: WorkspacePermissionOption[];
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
      discordAnalyticsDisabledAt: "-",
      discordAnalyticsDisabledReason: "",
      discordAnalyticsEnabled: true,
      residence: "Gera",
      profession: "IT-Service",
      phone: "-",
      discordId: "842109348219",
      discordJoinedAt: "Heute, 00:20",
      discordLastSeenAt: "Heute, 00:42",
      discordName: "elyx",
      discordOnServer: true,
      displayName: "Elias",
      instagram: "",
      snapchat: "",
      tiktok: "",
      stream: "",
      ubisoft: "",
      ea: "",
      notes: "",
      invitedBy: "Mara Seidel",
      status: "Aktiv",
      statusKey: "active",
      lastActivity: "Heute, 00:42",
      roles: ["Mitglied", "Voice Aktiv", "Dateienzugriff"],
      messagesMonth: 418,
      voiceHoursMonth: 38,
      linkedFiles: [
        {
          createdAt: "Heute, 00:41",
          fileId: "file-demo-1",
          name: "Aufnahmebogen.pdf",
          relationType: "linked",
          sizeLabel: "180 KB",
          type: "application/pdf",
        },
        {
          createdAt: "Gestern, 21:10",
          fileId: "file-demo-2",
          name: "Rollenfreigabe.png",
          relationType: "linked",
          sizeLabel: "94 KB",
          type: "image/png",
        },
      ],
    },
    {
      id: "MEM-1042",
      name: "Mara Seidel",
      age: 24,
      discordAnalyticsDisabledAt: "-",
      discordAnalyticsDisabledReason: "",
      discordAnalyticsEnabled: true,
      residence: "Jena",
      profession: "Medien",
      phone: "-",
      discordId: "742101095203",
      discordJoinedAt: "Gestern, 20:10",
      discordLastSeenAt: "Gestern, 22:18",
      discordName: "mara.s",
      discordOnServer: true,
      displayName: "Mara",
      instagram: "",
      snapchat: "",
      tiktok: "",
      stream: "",
      ubisoft: "",
      ea: "",
      notes: "",
      invitedBy: "System",
      status: "Aktiv",
      statusKey: "active",
      lastActivity: "Gestern, 22:18",
      roles: ["Moderator", "Ermittlungszugriff", "Mitgliederakten-Leser"],
      messagesMonth: 912,
      voiceHoursMonth: 64,
      linkedFiles: [
        {
          createdAt: "Gestern, 18:20",
          fileId: "file-demo-3",
          name: "Moderationsnotiz.docx",
          relationType: "note",
          sizeLabel: "42 KB",
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
    },
    {
      id: "MEM-1099",
      name: "Noah Becker",
      age: 31,
      discordAnalyticsDisabledAt: "02.06.2026, 19:04",
      discordAnalyticsDisabledReason: "Datenschutz-Widerspruch",
      discordAnalyticsEnabled: false,
      residence: "Leipzig",
      profession: "Logistik",
      phone: "-",
      discordId: "663180193355",
      discordJoinedAt: "02.06.2026, 18:20",
      discordLastSeenAt: "02.06.2026, 19:04",
      discordName: "nobeck",
      discordOnServer: true,
      displayName: "Noah",
      instagram: "",
      snapchat: "",
      tiktok: "",
      stream: "",
      ubisoft: "",
      ea: "",
      notes: "Datenschutz-Widerspruch hinterlegt.",
      invitedBy: "Elias Kramer",
      status: "Pruefung",
      statusKey: "review",
      lastActivity: "Auswertung deaktiviert",
      roles: ["Mitglied", "Bilderzugriff"],
      messagesMonth: 0,
      voiceHoursMonth: 0,
      linkedFiles: [
        {
          createdAt: "02.06.2026, 19:04",
          fileId: "file-demo-4",
          name: "Hinweis-2026-06.pdf",
          relationType: "evidence",
          sizeLabel: "320 KB",
          type: "application/pdf",
        },
      ],
    },
  ],
  files: [
    {
      id: "file-demo-1",
      categoryId: "category-demo-2",
      category: "Ermittlungen",
      createdAt: "Heute, 00:41",
      description: "Aufnahmebogen fuer die Mitgliederakte.",
      folder: "Aktive Faelle",
      folderId: "folder-demo-2",
      name: "Aufnahmebogen.pdf",
      originalName: "Aufnahmebogen.pdf",
      size: 184320,
      sizeLabel: "180 KB",
      storagePath: "demo/aufnahmebogen.pdf",
      tags: ["akte", "aufnahme"],
      type: "application/pdf",
      uploadedBy: "Mara Seidel",
    },
    {
      id: "file-demo-2",
      categoryId: "category-demo-1",
      category: "Mitteilungen",
      createdAt: "Gestern, 21:10",
      description: "Interne Rollenfreigabe.",
      folder: "Interne Rundschreiben",
      folderId: "folder-demo-1",
      name: "Rollenfreigabe.png",
      originalName: "Rollenfreigabe.png",
      size: 96256,
      sizeLabel: "94 KB",
      storagePath: "demo/rollenfreigabe.png",
      tags: ["freigabe"],
      type: "image/png",
      uploadedBy: "Elias Kramer",
    },
  ],
  folders: [
    {
      id: "folder-demo-1",
      categoryId: "category-demo-1",
      category: "Mitteilungen",
      folder: "Interne Rundschreiben",
      parentFolderId: "",
      permissions: [
        {
          roleId: "role-demo-1",
          role: "Administrator",
          roleKey: "administrator",
          canView: true,
          canOpen: true,
          canUpload: true,
          canDownload: true,
          canEdit: true,
          canDelete: true,
          canManagePermissions: true,
        },
      ],
      visibleFor: "Standardbenutzer",
      uploadFor: "Administrator",
      files: 42,
    },
    {
      id: "folder-demo-2",
      categoryId: "category-demo-2",
      category: "Ermittlungen",
      folder: "Aktive Faelle",
      parentFolderId: "",
      permissions: [
        {
          roleId: "role-demo-3",
          role: "Mitgliederakten-Bearbeiter",
          roleKey: "member_case_editor",
          canView: true,
          canOpen: true,
          canUpload: true,
          canDownload: true,
          canEdit: true,
          canDelete: false,
          canManagePermissions: false,
        },
      ],
      visibleFor: "Ermittlungszugriff",
      uploadFor: "Ermittlungszugriff",
      files: 31,
    },
    {
      id: "folder-demo-3",
      categoryId: "category-demo-3",
      category: "Gesetzgebung",
      folder: "Regelwerke",
      parentFolderId: "",
      permissions: [
        {
          roleId: "role-demo-4",
          role: "Dateienzugriff",
          roleKey: "file_access",
          canView: true,
          canOpen: true,
          canUpload: false,
          canDownload: true,
          canEdit: false,
          canDelete: false,
          canManagePermissions: false,
        },
      ],
      visibleFor: "Alle aktiven Benutzer",
      uploadFor: "Administrator",
      files: 18,
    },
    {
      id: "folder-demo-4",
      categoryId: "category-demo-4",
      category: "Platzhalter 1",
      folder: "Noch nicht zugeordnet",
      parentFolderId: "",
      permissions: [],
      visibleFor: "Administrator",
      uploadFor: "Administrator",
      files: 0,
    },
  ],
  roles: [
    {
      id: "role-demo-1",
      active: true,
      description: "Vollzugriff auf Systemverwaltung",
      role: "Administrator",
      roleKey: "administrator",
      permissions: ["Benutzer verwalten", "Rollen verwalten", "Dateien loeschen"],
      permissionsDetailed: [],
      members: 2,
    },
    {
      id: "role-demo-2",
      active: true,
      description: "Lesender Zugriff auf Mitgliederakten",
      role: "Mitgliederakten-Leser",
      roleKey: "member_case_reader",
      permissions: ["Akten suchen", "Akten oeffnen", "Dateiverknuepfungen sehen"],
      permissionsDetailed: [],
      members: 4,
    },
    {
      id: "role-demo-3",
      active: true,
      description: "Bearbeitender Zugriff auf Mitgliederakten",
      role: "Mitgliederakten-Bearbeiter",
      roleKey: "member_case_editor",
      permissions: ["Akten bearbeiten", "Dateien verknuepfen", "Akten exportieren"],
      permissionsDetailed: [],
      members: 3,
    },
    {
      id: "role-demo-4",
      active: true,
      description: "Zugriff auf Datei-Datenbank",
      role: "Dateienzugriff",
      roleKey: "file_access",
      permissions: ["Datei-Datenbank anzeigen", "Datei oeffnen", "Datei herunterladen"],
      permissionsDetailed: [],
      members: 16,
    },
  ],
  permissions: [
    {
      id: "permission-demo-1",
      key: "discord.invites.create",
      description: "Discord-Einladung ueber Datenbank anlegen",
    },
    {
      id: "permission-demo-2",
      key: "members.open",
      description: "Mitgliederakte oeffnen",
    },
  ],
  discordInvites: [
    {
      botError: "",
      dmError: "",
      dmSentAt: "-",
      dmStatus: "pending",
      id: "invite-demo-1",
      inviteeDiscordId: "123456789012345678",
      inviteeName: "Beispielmitglied",
      discordInviteCode: "demo",
      discordInviteUrl: "https://discord.gg/demo",
      targetMemberName: "Noah Becker",
      targetDiscordId: "663180193355",
      reason: "Aufnahme nach Pruefung",
      permission: "Discord-Einladung ueber Datenbank anlegen",
      permissionKey: "discord.invites.create",
      status: "pending",
      statusLabel: "Offen",
      uses: 0,
      maxUses: 1,
      expiresAt: "Morgen, 19:04",
      createdAt: "Heute, 19:04",
      requestedBy: "Mara Seidel",
    },
  ],
  moderationEvents: [
    {
      id: "mod-demo-1",
      eventType: "timeout",
      eventTypeLabel: "Timeout",
      status: "active",
      statusLabel: "Aktiv",
      memberName: "Elias Kramer",
      discordId: "842109348219",
      discordName: "elyx",
      moderator: "Mara Seidel",
      channel: "-",
      reason: "Spam im Textkanal",
      startedAt: "Heute, 13:20",
      endedAt: "Heute, 15:20",
      totalDuration: "2 Std.",
      remainingDuration: "42 Min.",
    },
    {
      id: "mod-demo-2",
      eventType: "ban",
      eventTypeLabel: "Ban",
      status: "active",
      statusLabel: "Aktiv",
      memberName: "Noah Becker",
      discordId: "663180193355",
      discordName: "nobeck",
      moderator: "System",
      channel: "-",
      reason: "Pruefung laeuft",
      startedAt: "Gestern, 21:10",
      endedAt: "-",
      totalDuration: "Unbegrenzt",
      remainingDuration: "Unbegrenzt",
    },
    {
      id: "mod-demo-3",
      eventType: "voice_disconnect",
      eventTypeLabel: "Verbindung getrennt",
      status: "recorded",
      statusLabel: "Erfasst",
      memberName: "Mara Seidel",
      discordId: "742101095203",
      discordName: "mara.s",
      moderator: "Elias Kramer",
      channel: "Voice 1",
      reason: "Stoergeraeusche",
      startedAt: "Gestern, 19:30",
      endedAt: "-",
      totalDuration: "-",
      remainingDuration: "-",
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
    rows: [
      {
        id: "user-demo-1",
        displayName: "Mara Seidel",
        email: "mara@example.invalid",
        status: "active",
        statusLabel: "Aktiv",
        twoFactorEnabled: true,
        username: "mara",
        roles: [
          {
            id: "role-demo-1",
            role: "Administrator",
            roleKey: "administrator",
          },
          {
            id: "role-demo-2",
            role: "Mitgliederakten-Leser",
            roleKey: "member_case_reader",
          },
        ],
      },
      {
        id: "user-demo-2",
        displayName: "Elias Kramer",
        email: "elias@example.invalid",
        status: "active",
        statusLabel: "Aktiv",
        twoFactorEnabled: true,
        username: "elias",
        roles: [
          {
            id: "role-demo-4",
            role: "Dateienzugriff",
            roleKey: "file_access",
          },
        ],
      },
      {
        id: "user-demo-3",
        displayName: "Tom Richter",
        email: "tom@example.invalid",
        status: "disabled",
        statusLabel: "Deaktiviert",
        twoFactorEnabled: false,
        username: "tom",
        roles: [],
      },
    ],
  },
  sync: {
    lastFullSync: "Noch offen",
    errorCount: 0,
    manualSync: "Adminrecht",
    botState: "nicht gestartet",
    rows: [
      ["Rollen-Sync", "Schema vorbereitet", true],
      ["Neue Mitglieder", "Auto-Aktenabgleich aktiv", true],
      ["Nachrichtenzaehler", "Monatsmodell vorbereitet", true],
      ["Voice-Sessions", "Tabellen vorbereitet", true],
      ["Datenschutz Opt-out", "Datenbankregel vorbereitet", true],
      ["DB-Einladungen", "Live-Erstellung vorbereitet", true],
      ["Moderationsregister", "Datenbankregister vorbereitet", true],
      ["Bot-Implementierung", "Cron-Sync vorbereitet", true],
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
      filesResult,
      rolesResult,
      permissionsResult,
      discordInvitesResult,
      moderationEventsResult,
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
            phone,
            discord_id,
            discord_username,
            discord_display_name,
            discord_joined_at,
            discord_last_seen_at,
            discord_on_server,
            discord_analytics_enabled,
            discord_analytics_disabled_reason,
            discord_analytics_disabled_at,
            instagram,
            snapchat,
            tiktok,
            stream,
            ubisoft,
            ea,
            notes,
            status,
            updated_at,
            invited_by:invited_by_member_id(name),
            message_activity_monthly(year, month, message_count, last_message_at),
            voice_activity_monthly(year, month, voice_minutes, last_voice_at),
            member_discord_roles(discord_roles(role_name)),
            member_files(
              relation_type,
              created_at,
              files(id, filename, original_filename, file_type, file_size)
            )
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
            category_id,
            parent_folder_id,
            name,
            file_categories(name),
            files(id),
            folder_permissions(
              can_view,
              can_open,
              can_upload,
              can_download,
              can_edit,
              can_delete,
              can_manage_permissions,
              roles(id, role_key, name)
            )
          `,
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("files")
        .select(
          `
            id,
            filename,
            original_filename,
            file_type,
            file_size,
            storage_path,
            category_id,
            folder_id,
            description,
            tags,
            uploaded_by,
            created_at,
            file_categories(id, name),
            folders(id, name)
          `,
        )
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("roles")
        .select(
          `
            id,
            role_key,
            name,
            description,
            active,
            role_permissions(permissions(id, permission_key, description)),
            user_roles(user_id)
          `,
        )
        .order("name", { ascending: true }),
      supabase
        .from("permissions")
        .select("id, permission_key, description")
        .order("permission_key", { ascending: true }),
      supabase
        .from("discord_invite_requests")
        .select(
          `
            id,
            invitee_name,
            invitee_discord_id,
            reason,
            status,
            max_uses,
            uses,
            expires_at,
            discord_invite_code,
            discord_invite_url,
            dm_status,
            dm_error,
            dm_sent_at,
            bot_error,
            created_at,
            requested_by_name,
            target_member:members!discord_invite_requests_target_member_id_fkey(name, discord_id),
            requested_permission:permissions!discord_invite_requests_requested_permission_id_fkey(permission_key, description)
          `,
        )
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("discord_moderation_events")
        .select(
          `
            id,
            discord_user_id,
            discord_username,
            event_type,
            status,
            reason,
            moderator_name,
            channel_name,
            started_at,
            ended_at,
            duration_seconds,
            last_synced_at,
            members(name, discord_id)
          `,
        )
        .order("started_at", { ascending: false }),
      supabase
        .from("profiles")
        .select(
          `
            id,
            username,
            display_name,
            email,
            status,
            two_factor_enabled,
            user_roles(roles(id, role_key, name))
          `,
        )
        .order("display_name", { ascending: true }),
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
    collectWarning(warnings, filesResult.error?.message);
    collectWarning(warnings, rolesResult.error?.message);
    collectWarning(warnings, permissionsResult.error?.message);
    collectWarning(warnings, discordInvitesResult.error?.message);
    collectWarning(warnings, moderationEventsResult.error?.message);
    collectWarning(warnings, profilesResult.error?.message);
    collectWarning(warnings, logsResult.error?.message);
    collectWarning(warnings, syncResult.error?.message);

    return {
      source: "supabase",
      members: mapMembers(membersResult.data ?? []),
      categories: mapCategories(categoriesResult.data ?? []),
      folders: mapFolders(foldersResult.data ?? []),
      files: mapFiles(filesResult.data ?? []),
      roles: mapRoles(rolesResult.data ?? []),
      permissions: mapPermissions(permissionsResult.data ?? []),
      discordInvites: mapDiscordInvites(discordInvitesResult.data ?? []),
      moderationEvents: mapModerationEvents(moderationEventsResult.data ?? []),
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
    const discordAnalyticsEnabled = row.discord_analytics_enabled !== false;
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
      discordAnalyticsDisabledAt: formatDate(
        String(row.discord_analytics_disabled_at ?? ""),
      ),
      discordAnalyticsDisabledReason: String(
        row.discord_analytics_disabled_reason ?? "",
      ),
      discordAnalyticsEnabled,
      residence: String(row.residence ?? "-"),
      profession: String(row.profession ?? "-"),
      phone: String(row.phone ?? ""),
      discordId: String(row.discord_id ?? "-"),
      discordJoinedAt: formatDate(String(row.discord_joined_at ?? "")),
      discordLastSeenAt: formatDate(String(row.discord_last_seen_at ?? "")),
      discordName: String(row.discord_username ?? "-"),
      discordOnServer: Boolean(row.discord_on_server),
      displayName: String(row.discord_display_name ?? row.discord_username ?? "-"),
      instagram: String(row.instagram ?? ""),
      snapchat: String(row.snapchat ?? ""),
      tiktok: String(row.tiktok ?? ""),
      stream: String(row.stream ?? ""),
      ubisoft: String(row.ubisoft ?? ""),
      ea: String(row.ea ?? ""),
      notes: String(row.notes ?? ""),
      invitedBy: String(asObject(row.invited_by)?.name ?? "-"),
      status: mapMemberStatus(String(row.status ?? "active")),
      statusKey: mapMemberStatusKey(String(row.status ?? "active")),
      lastActivity: discordAnalyticsEnabled
        ? formatDate(lastActivityAt)
        : "Auswertung deaktiviert",
      roles: asArray(row.member_discord_roles)
        .map((entry) => String(asObject(entry.discord_roles)?.role_name ?? ""))
        .filter(Boolean),
      messagesMonth: discordAnalyticsEnabled
        ? Number(currentMessageRow?.message_count ?? 0)
        : 0,
      voiceHoursMonth: discordAnalyticsEnabled
        ? Math.round(Number(currentVoiceRow?.voice_minutes ?? 0) / 60)
        : 0,
      linkedFiles: asArray(row.member_files)
        .map((entry) => {
          const file = asObject(entry.files);
          const fileId = String(file.id ?? "");
          const name = String(file.original_filename ?? file.filename ?? "");

          return {
            createdAt: formatDate(String(entry.created_at ?? "")),
            fileId,
            name,
            relationType: String(entry.relation_type ?? "linked"),
            sizeLabel: formatFileSize(Number(file.file_size ?? 0)),
            type: String(file.file_type ?? "application/octet-stream"),
          };
        })
        .filter((file) => file.fileId && file.name),
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
    const permissions = asArray(row.folder_permissions)
      .map((permission) => {
        const role = asObject(permission.roles);

        return {
          roleId: String(role.id ?? ""),
          role: String(role.name ?? ""),
          roleKey: String(role.role_key ?? ""),
          canView: Boolean(permission.can_view),
          canOpen: Boolean(permission.can_open),
          canUpload: Boolean(permission.can_upload),
          canDownload: Boolean(permission.can_download),
          canEdit: Boolean(permission.can_edit),
          canDelete: Boolean(permission.can_delete),
          canManagePermissions: Boolean(permission.can_manage_permissions),
        };
      })
      .filter((permission) => permission.roleId && permission.role);
    const viewRoles = permissions
      .filter((permission) => permission.canView)
      .map((permission) => permission.role);
    const uploadRoles = permissions
      .filter((permission) => permission.canUpload)
      .map((permission) => permission.role);

    return {
      id: String(row.id ?? ""),
      categoryId: String(row.category_id ?? ""),
      category: String(asObject(row.file_categories)?.name ?? "-"),
      folder: String(row.name ?? "Ordner"),
      parentFolderId: String(row.parent_folder_id ?? ""),
      permissions,
      visibleFor: viewRoles.join(", ") || "Nicht gesetzt",
      uploadFor: uploadRoles.join(", ") || "Nicht gesetzt",
      files: asArray(row.files).length,
    };
  });
}

function mapFiles(rows: Record<string, unknown>[]): WorkspaceFile[] {
  return rows.map((row) => {
    const category = asObject(row.file_categories);
    const folder = asObject(row.folders);
    const size = Number(row.file_size ?? 0);
    const originalName = String(
      row.original_filename ?? row.filename ?? "Datei",
    );

    return {
      id: String(row.id ?? ""),
      categoryId: String(row.category_id ?? ""),
      category: String(category.name ?? "-"),
      createdAt: formatDate(String(row.created_at ?? "")),
      description: String(row.description ?? ""),
      folder: String(folder.name ?? "-"),
      folderId: String(row.folder_id ?? ""),
      name: String(row.filename ?? originalName),
      originalName,
      size,
      sizeLabel: formatFileSize(size),
      storagePath: String(row.storage_path ?? ""),
      tags: Array.isArray(row.tags)
        ? row.tags.map(String).filter(Boolean)
        : [],
      type: String(row.file_type ?? "application/octet-stream"),
      uploadedBy: String(row.uploaded_by ?? "-"),
    };
  });
}

function mapRoles(rows: Record<string, unknown>[]): WorkspaceRoleRow[] {
  return rows.map((row) => {
    const permissionsDetailed = asArray(row.role_permissions)
      .map((entry) => {
        const permission = asObject(entry.permissions);

        return {
          description: String(
            permission.description ?? permission.permission_key ?? "",
          ),
          id: String(permission.id ?? ""),
          key: String(permission.permission_key ?? ""),
        };
      })
      .filter((permission) => permission.id && permission.description);

    return {
      active: Boolean(row.active ?? true),
      description: String(row.description ?? ""),
      id: String(row.id ?? ""),
      role: String(row.name ?? "Rolle"),
      roleKey: String(row.role_key ?? ""),
      permissions: permissionsDetailed.map(
        (permission) => permission.description,
      ),
      permissionsDetailed,
      members: asArray(row.user_roles).length,
    };
  });
}

function mapPermissions(rows: Record<string, unknown>[]): WorkspacePermissionOption[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    key: String(row.permission_key ?? ""),
    description: String(row.description ?? row.permission_key ?? ""),
  }));
}

function mapDiscordInvites(rows: Record<string, unknown>[]): WorkspaceDiscordInvite[] {
  return rows.map((row) => {
    const targetMember = asObject(row.target_member);
    const permission = asObject(row.requested_permission);
    const permissionKey = String(permission.permission_key ?? "");

    return {
      id: String(row.id ?? ""),
      inviteeName: String(row.invitee_name ?? "Unbekannt"),
      inviteeDiscordId: String(row.invitee_discord_id ?? ""),
      discordInviteCode: String(row.discord_invite_code ?? ""),
      discordInviteUrl: String(row.discord_invite_url ?? ""),
      dmStatus: String(row.dm_status ?? "pending"),
      dmError: String(row.dm_error ?? ""),
      dmSentAt: formatDate(String(row.dm_sent_at ?? "")),
      botError: String(row.bot_error ?? ""),
      targetMemberName: String(targetMember.name ?? "-"),
      targetDiscordId: String(targetMember.discord_id ?? "-"),
      reason: String(row.reason ?? "-"),
      permission: String(permission.description ?? permissionKey ?? "-"),
      permissionKey,
      status: String(row.status ?? "pending"),
      statusLabel: mapDiscordInviteStatus(String(row.status ?? "pending")),
      uses: Number(row.uses ?? 0),
      maxUses: Number(row.max_uses ?? 1),
      expiresAt: formatDate(String(row.expires_at ?? "")),
      createdAt: formatDate(String(row.created_at ?? "")),
      requestedBy: String(row.requested_by_name ?? "-"),
    };
  });
}

function mapModerationEvents(rows: Record<string, unknown>[]): WorkspaceModerationEvent[] {
  return rows.map((row) => {
    const member = asObject(row.members);
    const eventType = String(row.event_type ?? "kick");
    const status = String(row.status ?? "recorded");
    const durationSeconds =
      row.duration_seconds === null || row.duration_seconds === undefined
        ? null
        : Number(row.duration_seconds);
    const endedAt = String(row.ended_at ?? "");

    return {
      id: String(row.id ?? ""),
      eventType,
      eventTypeLabel: mapModerationEventType(eventType),
      status,
      statusLabel: mapModerationStatus(status),
      memberName: String(member.name ?? row.discord_username ?? "Unbekannt"),
      discordId: String(member.discord_id ?? row.discord_user_id ?? "-"),
      discordName: String(row.discord_username ?? "-"),
      moderator: String(row.moderator_name ?? "-"),
      channel: String(row.channel_name ?? "-"),
      reason: String(row.reason ?? "-"),
      startedAt: formatDate(String(row.started_at ?? "")),
      endedAt: formatDate(endedAt),
      totalDuration: formatDurationSeconds(durationSeconds, eventType),
      remainingDuration: formatRemainingDuration(endedAt, status, eventType),
    };
  });
}

function mapUsers(rows: Record<string, unknown>[]): WorkspaceUserSummary {
  return rows.reduce<WorkspaceUserSummary>(
    (summary, row) => {
      const status = String(row.status ?? "active");
      const roles = asArray(row.user_roles)
        .map((entry) => {
          const role = asObject(entry.roles);

          return {
            id: String(role.id ?? ""),
            role: String(role.name ?? ""),
            roleKey: String(role.role_key ?? ""),
          };
        })
        .filter((role) => role.id && role.role);

      if (row.status === "disabled") {
        summary.disabled += 1;
      } else {
        summary.active += 1;
      }

      if (row.two_factor_enabled) {
        summary.mfaEnabled += 1;
      }

      summary.rows.push({
        id: String(row.id ?? ""),
        displayName: String(row.display_name ?? row.email ?? "Benutzer"),
        email: String(row.email ?? "-"),
        status,
        statusLabel: mapUserStatus(status),
        twoFactorEnabled: Boolean(row.two_factor_enabled),
        username: String(row.username ?? "-"),
        roles,
      });

      return summary;
    },
    { active: 0, disabled: 0, mfaEnabled: 0, rows: [] },
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
        status: latest ? "Auto-Aktenabgleich aktiv" : "Schema vorbereitet",
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
        label: "Datenschutz Opt-out",
        status: "Datenbankregel vorbereitet",
        active: true,
      },
      {
        label: "DB-Einladungen",
        status: "Live-Erstellung aktiv",
        active: true,
      },
      {
        label: "Moderationsregister",
        status: "Datenbankregister vorbereitet",
        active: true,
      },
      {
        label: "Bot-Implementierung",
        status: latest ? "Live + Cron angebunden" : "Live-Sync vorbereitet",
        active: true,
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

function mapMemberStatusKey(status: string): "active" | "archived" | "review" {
  if (status === "review" || status === "archived") {
    return status;
  }

  return "active";
}

function mapUserStatus(status: string) {
  if (status === "disabled") {
    return "Deaktiviert";
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

function mapDiscordInviteStatus(status: string) {
  const labels: Record<string, string> = {
    pending: "Offen",
    created: "Erstellt",
    used: "Verwendet",
    expired: "Abgelaufen",
    cancelled: "Abgebrochen",
    failed: "Fehler",
  };

  return labels[status] ?? status;
}

function mapModerationEventType(eventType: string) {
  const labels: Record<string, string> = {
    warn: "Warnung",
    ban: "Ban",
    kick: "Kick",
    timeout: "Timeout",
    voice_disconnect: "Verbindung getrennt",
  };

  return labels[eventType] ?? eventType;
}

function mapModerationStatus(status: string) {
  const labels: Record<string, string> = {
    active: "Aktiv",
    expired: "Abgelaufen",
    failed: "Fehler",
    lifted: "Aufgehoben",
    recorded: "Erfasst",
  };

  return labels[status] ?? status;
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

function formatDurationSeconds(value: number | null, eventType: string) {
  if (value === null || !Number.isFinite(value)) {
    return eventType === "ban" ? "Unbegrenzt" : "-";
  }

  if (value <= 0) {
    return "0 Min.";
  }

  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);

  if (days > 0) {
    return hours > 0 ? `${days} T ${hours} Std.` : `${days} T`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours} Std. ${minutes} Min.` : `${hours} Std.`;
  }

  return `${Math.max(minutes, 1)} Min.`;
}

function formatRemainingDuration(
  endedAt: string,
  status: string,
  eventType: string,
) {
  if (status !== "active") {
    return "-";
  }

  if (!endedAt) {
    return eventType === "ban" ? "Unbegrenzt" : "-";
  }

  const endDate = new Date(endedAt);

  if (Number.isNaN(endDate.getTime())) {
    return "-";
  }

  const remainingSeconds = Math.max(
    Math.ceil((endDate.getTime() - Date.now()) / 1000),
    0,
  );

  if (remainingSeconds === 0) {
    return "Abgelaufen";
  }

  return formatDurationSeconds(remainingSeconds, eventType);
}

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(size)} ${units[unitIndex]}`;
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
