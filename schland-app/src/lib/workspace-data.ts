import type { AuthStatus } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";
import { hasGoogleDriveServerConfig } from "@/lib/google-drive";
import { mapLockdownStatusRow, type LockdownStatus } from "@/lib/lockdown";
import {
  createSupabaseServerClient,
  getSupabaseAdminClient,
} from "@/lib/supabase/server";
import {
  defaultTemporaryDesignSettings,
  defaultTemporaryDesignTemplates,
  getActiveTemporaryDesign,
  normalizeTemporaryDesignTemplates,
  normalizeTemporaryDesignTheme,
  type TemporaryDesignSettings,
  type TemporaryDesignState,
  type TemporaryDesignTemplate,
} from "@/lib/temporary-designs";

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
  discordRoleIds: string[];
  displayName: string;
  ea: string;
  instagram: string;
  intake: WorkspaceMemberIntake;
  invitedBy: string;
  lastActivity: string;
  linkedFiles: WorkspaceMemberFile[];
  messagesMonth: number;
  name: string;
  notes: string;
  phone: string;
  profileImageFileId: string;
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

export type WorkspaceMemberIntake = {
  answeredAt: string;
  answers: {
    age: string;
    ea: string;
    instagram: string;
    name: string;
    notes: string;
    profession: string;
    residence: string;
    snapchat: string;
    stream: string;
    tiktok: string;
    ubisoft: string;
  };
  raw: string;
  requestedAt: string;
  status: string;
  statusLabel: string;
};

export type WorkspaceFolder = {
  category: string;
  categoryId: string;
  files: number;
  folder: string;
  googleDriveFolderId?: string;
  id: string;
  parentFolderId: string;
  permissions: WorkspaceFolderPermission[];
  syncStatus?: string;
  syncStatusLabel?: string;
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
  externalUrl: string;
  folder: string;
  folderId: string;
  googleDriveFileId?: string;
  googleDrivePreviewLink?: string;
  googleDriveWebViewLink?: string;
  id: string;
  isGoogleDoc?: boolean;
  name: string;
  originalName: string;
  size: number;
  sizeLabel: string;
  source: string;
  storagePath: string;
  syncStatus?: string;
  syncStatusLabel?: string;
  tags: string[];
  type: string;
  uploadedBy: string;
};

export type WorkspaceDriveConflict = {
  conflictType: string;
  createdAt: string;
  entityType: string;
  googleDriveId: string;
  id: string;
  localEntityId: string;
  status: string;
};

export type WorkspaceDriveSync = {
  configured: boolean;
  conflicts: WorkspaceDriveConflict[];
  conflictCount: number;
  errorCount: number;
  latestRunAt: string;
  latestStatus: string;
  nextScheduled: string;
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

export type WorkspaceDiscordRoleOption = {
  discordRoleId: string;
  id: string;
  name: string;
};

export type WorkspaceRepresentationMinistryRole = {
  active: boolean;
  discordRoleId: string;
  id: string;
  name: string;
  sortOrder: number;
};

export type WorkspaceRepresentationEligibility = {
  active: boolean;
  allowedMinistryRoleIds: string[];
  allowedMinistryRoles: string[];
  discordId: string;
  id: string;
  memberId: string;
  memberName: string;
  notes: string;
  priority: number;
};

export type WorkspaceAbsenceRepresentation = {
  assignedAt: string;
  approvalRequestedAt: string;
  approvalRespondedAt: string;
  approvalStatus: string;
  botError: string;
  discordRoleId: string;
  id: string;
  ministryRoleName: string;
  removedAt: string;
  representativeDiscordId: string;
  representativeHadRoleBefore: boolean;
  representativeMemberId: string;
  representativeName: string;
  roleWasAssignedAutomatically: boolean;
  status: string;
  statusLabel: string;
};

export type WorkspaceMemberAbsence = {
  discordId: string;
  endedAt: string;
  endedBy: string;
  endReason: string;
  expectedReturnAt: string;
  id: string;
  memberId: string;
  memberName: string;
  reason: string;
  representations: WorkspaceAbsenceRepresentation[];
  requestedBy: string;
  startedAt: string;
  status: string;
  statusLabel: string;
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
  commandError: string;
  commandStatus: string;
  discordId: string;
  discordName: string;
  durationSeconds: number | null;
  durationMode: string;
  endedAt: string;
  eventType: string;
  eventTypeLabel: string;
  id: string;
  lifetime: boolean;
  memberId: string;
  memberName: string;
  moderator: string;
  moderatorDiscordId: string;
  reason: string;
  remainingDuration: string;
  source: string;
  startedAt: string;
  status: string;
  statusLabel: string;
  totalDuration: string;
};

export type WorkspaceModerationAdviceEvidence = {
  createdAt: string;
  description: string;
  evidenceType: string;
  externalUrl: string;
  id: string;
  label: string;
  metadata: Record<string, unknown>;
  signedUrl: string;
};

export type WorkspaceModerationAdviceLog = {
  action: string;
  createdAt: string;
  details: Record<string, unknown>;
  id: string;
};

export type WorkspaceModerationAdviceCase = {
  affectedPeople: string;
  aiOutput: Record<string, unknown>;
  archivedAt: string;
  behaviorSummary: string;
  caseNumber: string;
  confidence: number | null;
  createdAt: string;
  desiredOutcome: string;
  evidence: WorkspaceModerationAdviceEvidence[];
  evidenceSummary: Record<string, unknown>;
  executed: boolean;
  executedAt: string;
  executionEventId: string;
  id: string;
  incidentAt: string;
  internalNotes: string;
  legalBasisSnapshot: Record<string, unknown>;
  logs: WorkspaceModerationAdviceLog[];
  modelName: string;
  modelProvider: string;
  officialAz?: string;
  officialDocumentCreatedAt?: string;
  officialDocumentFileId?: string;
  officialDocumentId?: string;
  officialDocumentStatus?: string;
  officialDocumentUrl?: string;
  priorHistorySnapshot: Record<string, unknown>;
  recommendedAction: string;
  recommendedEventType: string;
  recommendedReason: string;
  severityScore: number | null;
  situationText: string;
  status: string;
  statusLabel: string;
  targetDiscordId: string;
  targetDiscordUsername: string;
  targetMemberId: string;
  targetName: string;
  title: string;
  updatedAt: string;
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
  twoFactorRequired: boolean;
  username: string;
};

export type WorkspaceUserSummary = {
  active: number;
  disabled: number;
  mfaEnabled: number;
  mfaRequirementDisabled: number;
  mfaRequired: number;
  rows: WorkspaceUserRow[];
};

export type WorkspaceSyncStatus = {
  botState: string;
  errorCount: number;
  lastFullSync: string;
  liveSignalAge: string;
  liveSignalFresh: boolean;
  liveVoiceSessions: number;
  manualSync: string;
  memberCoverageComplete: boolean;
  memberGuildName: string;
  memberMissingEstimate: number | null;
  memberPageLimitHit: boolean;
  memberServerEstimate: number | null;
  memberScanned: number;
  memberSkippedBots: number;
  memberUpserted: number;
  moderationQueueSize: number;
  questionnaireQueueSize: number;
  representationQueueSize: number;
  rows: {
    active: boolean;
    label: string;
    status: string;
  }[];
};

export type WorkspaceData = {
  absences: WorkspaceMemberAbsence[];
  categories: WorkspaceCategory[];
  discordInvites: WorkspaceDiscordInvite[];
  discordRoles: WorkspaceDiscordRoleOption[];
  files: WorkspaceFile[];
  folders: WorkspaceFolder[];
  driveSync: WorkspaceDriveSync;
  logs: WorkspaceLogRow[];
  lockdown: LockdownStatus;
  members: WorkspaceMember[];
  ministryRoles: WorkspaceRepresentationMinistryRole[];
  moderationAdviceCases: WorkspaceModerationAdviceCase[];
  moderationEvents: WorkspaceModerationEvent[];
  permissions: WorkspacePermissionOption[];
  representationEligibilities: WorkspaceRepresentationEligibility[];
  roles: WorkspaceRoleRow[];
  source: "demo" | "supabase";
  sync: WorkspaceSyncStatus;
  temporaryDesigns: TemporaryDesignState;
  users: WorkspaceUserSummary;
  warning?: string;
};

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;
const displayTimeZone = "Europe/Berlin";
const memberCaseLoadLimit = 1000;

const inactiveLockdownStatus: LockdownStatus = {
  active: false,
  activatedAt: "",
  activatedByName: "",
  botError: "",
  botStatus: "idle",
  canManage: false,
  importantChannelIds: [],
  reason: "",
};

const demoTemporaryDesigns: TemporaryDesignState = {
  activeDesign: getActiveTemporaryDesign({
    settings: defaultTemporaryDesignSettings,
    templates: defaultTemporaryDesignTemplates,
  }),
  storageMessage: "Demo-Modus: Supabase ist nicht verbunden.",
  storageReady: false,
  settings: defaultTemporaryDesignSettings,
  templates: defaultTemporaryDesignTemplates,
};

function emptyMemberIntake(): WorkspaceMemberIntake {
  return {
    answeredAt: "-",
    answers: {
      age: "",
      ea: "",
      instagram: "",
      name: "",
      notes: "",
      profession: "",
      residence: "",
      snapchat: "",
      stream: "",
      tiktok: "",
      ubisoft: "",
    },
    raw: "",
    requestedAt: "-",
    status: "none",
    statusLabel: "Nicht angefragt",
  };
}

function emptyDriveSyncStatus(): WorkspaceDriveSync {
  return {
    configured: hasGoogleDriveServerConfig(),
    conflicts: [],
    conflictCount: 0,
    errorCount: 0,
    latestRunAt: "Noch offen",
    latestStatus: "nicht gestartet",
    nextScheduled: "06:00 / 20:00",
  };
}

export const demoWorkspaceData: WorkspaceData = {
  source: "demo",
  lockdown: inactiveLockdownStatus,
  temporaryDesigns: demoTemporaryDesigns,
  driveSync: emptyDriveSyncStatus(),
  absences: [],
  discordRoles: [],
  ministryRoles: [],
  representationEligibilities: [],
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
      profileImageFileId: "file-demo-2",
      discordId: "842109348219",
      discordJoinedAt: "Heute, 00:20",
      discordLastSeenAt: "Heute, 00:42",
      discordName: "elyx",
      discordOnServer: true,
      discordRoleIds: [],
      displayName: "Elias",
      instagram: "",
      intake: emptyMemberIntake(),
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
          relationType: "avatar",
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
      profileImageFileId: "",
      discordId: "742101095203",
      discordJoinedAt: "Gestern, 20:10",
      discordLastSeenAt: "Gestern, 22:18",
      discordName: "mara.s",
      discordOnServer: true,
      discordRoleIds: [],
      displayName: "Mara",
      instagram: "",
      intake: emptyMemberIntake(),
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
      profileImageFileId: "",
      discordId: "663180193355",
      discordJoinedAt: "02.06.2026, 18:20",
      discordLastSeenAt: "02.06.2026, 19:04",
      discordName: "nobeck",
      discordOnServer: true,
      discordRoleIds: [],
      displayName: "Noah",
      instagram: "",
      intake: emptyMemberIntake(),
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
      externalUrl: "",
      folder: "Aktive Faelle",
      folderId: "folder-demo-2",
      name: "Aufnahmebogen.pdf",
      originalName: "Aufnahmebogen.pdf",
      size: 184320,
      sizeLabel: "180 KB",
      source: "supabase",
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
      externalUrl: "",
      folder: "Interne Rundschreiben",
      folderId: "folder-demo-1",
      name: "Rollenfreigabe.png",
      originalName: "Rollenfreigabe.png",
      size: 96256,
      sizeLabel: "94 KB",
      source: "supabase",
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
          role: "Root Owner",
          roleKey: "root_owner",
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
      role: "Root Owner",
      roleKey: "root_owner",
      permissions: ["Wildcard-Vollzugriff fuer Root Owner"],
      permissionsDetailed: [],
      members: 1,
    },
    {
      id: "role-demo-2",
      active: true,
      description: "Technische Verwaltung ohne automatischen Aktenzugriff",
      role: "Administrator",
      roleKey: "platform_admin",
      permissions: ["Benutzer verwalten", "Rollen verwalten", "Dateien verwalten"],
      permissionsDetailed: [],
      members: 2,
    },
    {
      id: "role-demo-3",
      active: true,
      description: "Innenverwaltung mit Akten- und Moderationszugriff",
      role: "Innenministerium",
      roleKey: "interior_ministry",
      permissions: ["Sensible Akten bearbeiten", "Ermittlungen bearbeiten", "Moderation"],
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
      memberId: "member-demo-2",
      durationSeconds: 7200,
      durationMode: "timed",
      eventType: "timeout",
      eventTypeLabel: "Timeout",
      lifetime: false,
      status: "active",
      statusLabel: "Aktiv",
      memberName: "Elias Kramer",
      discordId: "842109348219",
      discordName: "elyx",
      moderator: "Mara Seidel",
      moderatorDiscordId: "demo-mod-1",
      channel: "-",
      commandError: "",
      commandStatus: "",
      reason: "Spam im Textkanal",
      source: "demo",
      startedAt: "Heute, 13:20",
      endedAt: "Heute, 15:20",
      totalDuration: "2 Std.",
      remainingDuration: "42 Min.",
    },
    {
      id: "mod-demo-2",
      memberId: "member-demo-1",
      durationSeconds: null,
      durationMode: "lifetime",
      eventType: "ban",
      eventTypeLabel: "Ban",
      lifetime: true,
      status: "active",
      statusLabel: "Aktiv",
      memberName: "Noah Becker",
      discordId: "663180193355",
      discordName: "nobeck",
      moderator: "System",
      moderatorDiscordId: "demo-system",
      channel: "-",
      commandError: "",
      commandStatus: "",
      reason: "Pruefung laeuft",
      source: "demo",
      startedAt: "Gestern, 21:10",
      endedAt: "-",
      totalDuration: "Lifetime",
      remainingDuration: "Dauerhaft",
    },
    {
      id: "mod-demo-3",
      memberId: "member-demo-3",
      durationSeconds: null,
      durationMode: "lifetime",
      eventType: "voice_disconnect",
      eventTypeLabel: "Verbindung getrennt",
      lifetime: true,
      status: "recorded",
      statusLabel: "Erfasst",
      memberName: "Mara Seidel",
      discordId: "742101095203",
      discordName: "mara.s",
      moderator: "Elias Kramer",
      moderatorDiscordId: "demo-mod-2",
      channel: "Voice 1",
      commandError: "",
      commandStatus: "",
      reason: "Stoergeraeusche",
      source: "demo",
      startedAt: "Gestern, 19:30",
      endedAt: "-",
      totalDuration: "-",
      remainingDuration: "-",
    },
  ],
  moderationAdviceCases: [
    {
      affectedPeople: "Textkanal Allgemein",
      aiOutput: {
        alternatives: ["Warn mit manueller Nachkontrolle", "Weitere Screenshots nachfordern"],
        confidence: 0.71,
        humanExplanation:
          "Der Vorfall wirkt wie ein klarer leichter Regelverstoss, die Belege sind aber nur teilweise vollstaendig.",
        legalBasis: [
          {
            reason: "Chatverhalten und respektvoller Umgang betroffen.",
            section: "Regelwerk Schland § 3",
            source: "Regelwerk Schland",
          },
        ],
        recommendedAction: "warn",
        riskFlags: ["Belege nur auszugsweise vorhanden"],
      },
      archivedAt: "",
      behaviorSummary: "Wiederholte Provokation und leichter Spam",
      caseNumber: "SANK-20260614-0001",
      confidence: 0.71,
      createdAt: "Heute, 13:45",
      desiredOutcome: "Warn pruefen",
      evidence: [
        {
          createdAt: "Heute, 13:45",
          description: "",
          evidenceType: "message_link",
          externalUrl: "https://discord.com/channels/demo/demo/demo",
          id: "advice-evidence-demo-1",
          label: "Discord Message-Link",
          metadata: {},
          signedUrl: "",
        },
      ],
      evidenceSummary: {},
      executed: false,
      executedAt: "",
      executionEventId: "",
      id: "advice-demo-1",
      incidentAt: "Heute, 13:20",
      internalNotes: "Demo-Fall",
      legalBasisSnapshot: {},
      logs: [
        {
          action: "beratung_erstellt",
          createdAt: "Heute, 13:45",
          details: {},
          id: "advice-log-demo-1",
        },
      ],
      modelName: "demo",
      modelProvider: "demo",
      priorHistorySnapshot: {
        rows: [
          {
            eventType: "warn",
            reason: "Leichte Stoerung",
            startedAt: "2026-06-10T12:00:00.000Z",
          },
        ],
      },
      recommendedAction: "warn",
      recommendedEventType: "warn",
      recommendedReason: "Warn wegen wiederholter leichter Stoerung",
      severityScore: 32,
      situationText:
        "Nutzer hat trotz Hinweis mehrfach im falschen Kanal provoziert.",
      status: "advice_ready",
      statusLabel: "Empfehlung bereit",
      targetDiscordId: "842109348219",
      targetDiscordUsername: "elyx",
      targetMemberId: "MEM-1007",
      targetName: "Elias Kramer",
      title: "Provokation im Textkanal",
      updatedAt: "Heute, 13:48",
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
    mfaRequired: 20,
    mfaRequirementDisabled: 1,
    disabled: 3,
    rows: [
      {
        id: "user-demo-1",
        displayName: "Mara Seidel",
        email: "mara@example.invalid",
        status: "active",
        statusLabel: "Aktiv",
        twoFactorEnabled: true,
        twoFactorRequired: true,
        username: "mara",
        roles: [
          {
            id: "role-demo-1",
            role: "Root Owner",
            roleKey: "root_owner",
          },
          {
            id: "role-demo-2",
            role: "Administrator",
            roleKey: "platform_admin",
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
        twoFactorRequired: false,
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
        twoFactorRequired: true,
        username: "tom",
        roles: [],
      },
    ],
  },
  sync: {
    lastFullSync: "Noch offen",
    errorCount: 0,
    liveSignalAge: "-",
    liveSignalFresh: false,
    liveVoiceSessions: 0,
    manualSync: "Adminrecht",
    botState: "nicht gestartet",
    memberCoverageComplete: true,
    memberGuildName: "-",
    memberMissingEstimate: null,
    memberPageLimitHit: false,
    memberServerEstimate: null,
    memberScanned: 0,
    memberSkippedBots: 0,
    memberUpserted: 0,
    moderationQueueSize: 0,
    questionnaireQueueSize: 0,
    representationQueueSize: 0,
    rows: [
      ["Rollen-Sync", "Schema vorbereitet", true],
      ["Neue Mitglieder", "Auto-Aktenabgleich aktiv", true],
      ["Nachrichtenzaehler", "Monatsmodell vorbereitet", true],
      ["Voice-Sessions", "Tabellen vorbereitet", true],
      ["Datenschutz Opt-out", "Datenbankregel vorbereitet", true],
      ["DB-Einladungen", "Live-Erstellung vorbereitet", true],
      ["Aktenbogen-DMs", "DM-Abfrage vorbereitet", true],
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
      moderationAdviceCasesResult,
      profilesResult,
      intakeLogsResult,
      logsResult,
      lockdownResult,
      syncResult,
      driveFolderMetaResult,
      driveFileMetaResult,
      driveRunsResult,
      driveConflictsResult,
      discordRolesResult,
      ministryRolesResult,
      representationEligibilitiesResult,
      absencesResult,
    ] = await Promise.all([
      supabase
        .from("members")
        .select(
          `
            id,
            image_file_id,
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
            member_discord_roles(discord_roles(discord_role_id, role_name)),
            member_files(
              relation_type,
              created_at,
              files(id, filename, original_filename, file_type, file_size)
            )
          `,
        )
        .order("updated_at", { ascending: false })
        .limit(memberCaseLoadLimit),
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
            external_url,
            source,
            source_id,
            source_mime_type,
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
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("discord_moderation_events")
        .select(
          `
            id,
            member_id,
            discord_user_id,
            discord_username,
            event_type,
            status,
            reason,
            moderator_name,
            moderator_discord_id,
            channel_name,
            source,
            started_at,
            ended_at,
            duration_seconds,
            metadata,
            last_synced_at,
            members(name, discord_id)
          `,
        )
        .order("started_at", { ascending: false }),
      supabase
        .from("moderation_advice_cases")
        .select(
          `
            id,
            case_number,
            title,
            status,
            target_member_id,
            target_discord_user_id,
            target_discord_username,
            submitted_by,
            created_at,
            updated_at,
            incident_at,
            situation_text,
            behavior_summary,
            affected_people,
            desired_outcome,
            internal_notes,
            prior_history_snapshot,
            legal_basis_snapshot,
            evidence_summary,
            ai_output,
            model_provider,
            model_name,
            recommended_action,
            recommended_event_type,
            recommended_reason,
            confidence,
            severity_score,
            execution_event_id,
            executed_by,
            executed_at,
            archived_at,
            official_document_id,
            official_az,
            target_member:members!moderation_advice_cases_target_member_id_fkey(
              id,
              name,
              discord_id,
              discord_username,
              discord_display_name
            ),
            moderation_advice_evidence(
              id,
              evidence_type,
              label,
              description,
              external_url,
              metadata,
              created_at
            ),
            moderation_advice_logs(
              id,
              action,
              details,
              created_at
            ),
            moderation_advice_official_documents(
              id,
              az,
              status,
              document_type,
              file_id,
              google_drive_file_id,
              metadata,
              created_at,
              files(
                id,
                external_url,
                google_drive_web_view_link
              )
            )
          `,
        )
        .order("updated_at", { ascending: false })
        .limit(120),
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
            two_factor_required,
            user_roles(roles(id, role_key, name))
          `,
        )
        .order("display_name", { ascending: true }),
      supabase
        .from("member_case_logs")
        .select("id, member_id, reason, success, created_at, old_value, new_value")
        .eq("field_name", "discord_intake_questionnaire")
        .order("created_at", { ascending: false })
        .limit(memberCaseLoadLimit),
      supabase
        .from("member_case_logs")
        .select("id, username, action, reason, success, created_at, member_id")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.rpc("get_lockdown_status"),
      supabase
        .from("sync_runs")
        .select("id, source, status, started_at, finished_at, error_message, metadata")
        .order("started_at", { ascending: false })
        .limit(12),
      supabase
        .from("folders")
        .select("id, google_drive_folder_id, sync_status, deleted_at")
        .limit(500),
      supabase
        .from("files")
        .select(
          "id, google_drive_file_id, google_drive_web_view_link, google_drive_preview_link, sync_status, is_google_doc, deleted_at",
        )
        .limit(500),
      supabase
        .from("sync_runs")
        .select(
          "id, source, status, trigger_type, started_at, finished_at, error_message, summary, conflicts_found, errors_found",
        )
        .eq("source", "google-drive")
        .order("started_at", { ascending: false })
        .limit(8),
      supabase
        .from("drive_sync_conflicts")
        .select(
          "id, entity_type, local_entity_id, google_drive_id, conflict_type, status, created_at",
        )
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("discord_roles")
        .select("id, discord_role_id, role_name")
        .order("role_name", { ascending: true })
        .limit(500),
      supabase
        .from("representation_ministry_roles")
        .select("id, discord_role_id, name, active, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("representation_eligibilities")
        .select(
          `
            id,
            representative_member_id,
            representative_discord_id,
            active,
            priority,
            notes,
            members(id, name, discord_id, discord_username, discord_display_name),
            representation_eligibility_ministry_roles(
              ministry_role_id,
              representation_ministry_roles(id, name, discord_role_id)
            )
          `,
        )
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("member_absences")
        .select(
          `
            id,
            member_id,
            discord_user_id,
            reason,
            status,
            expected_return_at,
            started_at,
            ended_at,
            requested_by_name,
            ended_by_name,
            end_reason,
            members(id, name, discord_id, discord_username, discord_display_name),
            member_absence_representations(
              id,
              representative_member_id,
              representative_discord_id,
              discord_role_id,
              ministry_role_name,
              status,
              approval_status,
              approval_requested_at,
              approval_responded_at,
              representative_had_role_before,
              role_was_assigned_automatically,
              assigned_at,
              removed_at,
              bot_error,
              representative:members!member_absence_representations_representative_member_id_fkey(
                id,
                name,
                discord_id,
                discord_username,
                discord_display_name
              )
            )
          `,
        )
        .order("started_at", { ascending: false })
        .limit(100),
    ]);

    collectWarning(warnings, membersResult.error?.message);
    collectWarning(warnings, categoriesResult.error?.message);
    collectWarning(warnings, foldersResult.error?.message);
    collectWarning(warnings, filesResult.error?.message);
    collectWarning(warnings, rolesResult.error?.message);
    collectWarning(warnings, permissionsResult.error?.message);
    collectWarning(warnings, discordInvitesResult.error?.message);
    collectWarning(warnings, moderationEventsResult.error?.message);
    collectWarningIfActionable(warnings, moderationAdviceCasesResult.error?.message);
    collectWarning(warnings, profilesResult.error?.message);
    collectWarning(warnings, intakeLogsResult.error?.message);
    collectWarning(warnings, logsResult.error?.message);
    collectWarning(warnings, lockdownResult.error?.message);
    collectWarning(warnings, syncResult.error?.message);
    collectWarningIfActionable(warnings, driveRunsResult.error?.message);
    collectWarningIfActionable(warnings, driveConflictsResult.error?.message);
    collectWarning(warnings, discordRolesResult.error?.message);
    collectWarning(warnings, ministryRolesResult.error?.message);
    collectWarning(warnings, representationEligibilitiesResult.error?.message);
    collectWarning(warnings, absencesResult.error?.message);

    const temporaryDesigns = await loadTemporaryDesignState(warnings);

    return {
      source: "supabase",
      absences: mapAbsences(absencesResult.data ?? []),
      members: mapMembers(
        membersResult.data ?? [],
        intakeLogsResult.data ?? [],
      ),
      categories: mapCategories(categoriesResult.data ?? []),
      folders: mapFolders(
        foldersResult.data ?? [],
        mapRowsById(driveFolderMetaResult.data ?? []),
      ),
      files: mapFiles(
        filesResult.data ?? [],
        mapRowsById(driveFileMetaResult.data ?? []),
      ),
      driveSync: mapDriveSync(
        driveRunsResult.data ?? [],
        driveConflictsResult.data ?? [],
      ),
      roles: mapRoles(rolesResult.data ?? []),
      permissions: mapPermissions(permissionsResult.data ?? []),
      discordRoles: mapDiscordRoles(discordRolesResult.data ?? []),
      ministryRoles: mapMinistryRoles(ministryRolesResult.data ?? []),
      representationEligibilities: mapRepresentationEligibilities(
        representationEligibilitiesResult.data ?? [],
      ),
      discordInvites: mapDiscordInvites(discordInvitesResult.data ?? []),
      moderationAdviceCases: mapModerationAdviceCases(
        moderationAdviceCasesResult.data ?? [],
      ),
      moderationEvents: mapModerationEvents(moderationEventsResult.data ?? []),
      users: mapUsers(profilesResult.data ?? []),
      logs: mapLogs(logsResult.data ?? []),
      lockdown: mapLockdownStatusRow(
        Array.isArray(lockdownResult.data)
          ? (lockdownResult.data[0] as Record<string, unknown> | null)
          : null,
      ),
      sync: mapSync(syncResult.data ?? []),
      temporaryDesigns,
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

function collectWarningIfActionable(warnings: string[], message?: string) {
  if (!message || isOptionalDriveSchemaWarning(message)) {
    return;
  }

  collectWarning(warnings, message);
}

function isOptionalDriveSchemaWarning(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("drive_sync_conflicts") ||
    normalized.includes("google_drive_") ||
    normalized.includes("sync_status") ||
    normalized.includes("deleted_at") ||
    normalized.includes("trigger_type") ||
    normalized.includes("schema cache")
  );
}

async function loadTemporaryDesignState(warnings: string[]) {
  try {
    const admin = getSupabaseAdminClient();
    const [settingsResult, templatesResult] = await Promise.all([
      admin
        .from("temporary_design_settings")
        .select(
          "enabled, automatic_enabled, manual_enabled, manual_template_key, manual_start_date, manual_end_date, manual_priority",
        )
        .eq("id", true)
        .maybeSingle(),
      admin
        .from("temporary_design_templates")
        .select(
          "key, name, event_name, enabled, manual_only, recurring, start_date, end_date, dynamic_date, start_offset_days, end_offset_days, priority, theme",
        )
        .order("priority", { ascending: false })
        .order("name", { ascending: true }),
    ]);

    const errorMessage =
      settingsResult.error?.message ?? templatesResult.error?.message ?? "";

    if (errorMessage) {
      const state = mapTemporaryDesignState(null, [], false, getTemporaryDesignStorageMessage(errorMessage));
      collectWarningIfActionable(warnings, errorMessage);

      return state;
    }

    return mapTemporaryDesignState(
      settingsResult.data ?? null,
      templatesResult.data ?? [],
      true,
      "Supabase-Speicher ist verbunden.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase Fehler";
    collectWarningIfActionable(warnings, message);

    return mapTemporaryDesignState(null, [], false, getTemporaryDesignStorageMessage(message));
  }
}

function getTemporaryDesignStorageMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("temporary_design_settings") ||
    normalized.includes("temporary_design_templates") ||
    normalized.includes("schema cache") ||
    normalized.includes("does not exist")
  ) {
    return "Supabase-Migration 20260618030821_sync_temporary_design_templates.sql fuer temporaere Designs fehlt noch.";
  }

  return message || "Supabase-Speicher fuer temporaere Designs ist nicht erreichbar.";
}

function mapRowsById(rows: Record<string, unknown>[]) {
  return new Map(
    rows
      .map((row) => [String(row.id ?? ""), row] as const)
      .filter(([id]) => Boolean(id)),
  );
}

function mapTemporaryDesignState(
  settingsRow: Record<string, unknown> | null,
  templateRows: Record<string, unknown>[],
  storageReady = true,
  storageMessage = "Supabase-Speicher ist verbunden.",
): TemporaryDesignState {
  const settings = mapTemporaryDesignSettings(settingsRow);
  const templates = normalizeTemporaryDesignTemplates(
    templateRows.map(mapTemporaryDesignTemplate),
  );

  return {
    activeDesign: getActiveTemporaryDesign({ settings, templates }),
    storageMessage,
    storageReady,
    settings,
    templates,
  };
}

function mapTemporaryDesignSettings(
  row: Record<string, unknown> | null,
): TemporaryDesignSettings {
  if (!row) {
    return defaultTemporaryDesignSettings;
  }

  return {
    automaticEnabled: row.automatic_enabled !== false,
    enabled: row.enabled !== false,
    manualEnabled: row.manual_enabled === true,
    manualEndDate: String(row.manual_end_date ?? ""),
    manualPriority: Number(row.manual_priority ?? 100),
    manualStartDate: String(row.manual_start_date ?? ""),
    manualTemplateKey: String(row.manual_template_key ?? ""),
  };
}

function mapTemporaryDesignTemplate(row: Record<string, unknown>): TemporaryDesignTemplate {
  return {
    dynamicDate: String(row.dynamic_date ?? ""),
    enabled: row.enabled !== false,
    endDate: String(row.end_date ?? ""),
    endOffsetDays: Number(row.end_offset_days ?? 0),
    eventName: String(row.event_name ?? row.name ?? ""),
    key: String(row.key ?? ""),
    manualOnly: row.manual_only === true,
    name: String(row.name ?? row.key ?? "Design"),
    priority: Number(row.priority ?? 0),
    recurring: row.recurring === true,
    startDate: String(row.start_date ?? ""),
    startOffsetDays: Number(row.start_offset_days ?? 0),
    theme: normalizeTemporaryDesignTheme(asObject(row.theme)),
  };
}

function mapMembers(
  rows: Record<string, unknown>[],
  intakeLogs: Record<string, unknown>[] = [],
): WorkspaceMember[] {
  const intakeByMemberId = mapMemberIntakeLogs(intakeLogs);

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
      String(currentMessageRow?.last_message_at ?? "");

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
      profileImageFileId: String(row.image_file_id ?? ""),
      discordId: String(row.discord_id ?? "-"),
      discordJoinedAt: formatDate(String(row.discord_joined_at ?? "")),
      discordLastSeenAt: formatDate(String(row.discord_last_seen_at ?? "")),
      discordName: String(row.discord_username ?? "-"),
      discordOnServer: Boolean(row.discord_on_server),
      displayName: String(row.discord_display_name ?? row.discord_username ?? "-"),
      instagram: String(row.instagram ?? ""),
      intake: intakeByMemberId.get(String(row.id ?? "")) ?? emptyMemberIntake(),
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
      discordRoleIds: asArray(row.member_discord_roles)
        .map((entry) => String(asObject(entry.discord_roles)?.discord_role_id ?? ""))
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

function mapMemberIntakeLogs(
  rows: Record<string, unknown>[],
): Map<string, WorkspaceMemberIntake> {
  const groupedRows = new Map<string, Record<string, unknown>[]>();

  for (const row of rows) {
    const memberId = String(row.member_id ?? "");

    if (!memberId) {
      continue;
    }

    groupedRows.set(memberId, [...(groupedRows.get(memberId) ?? []), row]);
  }

  const byMemberId = new Map<string, WorkspaceMemberIntake>();

  for (const [memberId, memberRows] of groupedRows.entries()) {
    byMemberId.set(memberId, mapMemberIntake(memberRows));
  }

  return byMemberId;
}

function mapMemberIntake(rows: Record<string, unknown>[]): WorkspaceMemberIntake {
  const intake = emptyMemberIntake();
  const submittedSections = new Set<string>();
  let latestStatus = "none";

  for (const row of rows) {
    const payload = parseJsonObject(row.new_value);
    const answers = asObject(payload.answers);
    const status = String(payload.status ?? (row.success ? "sent" : "failed"));
    const createdAt = formatDate(String(row.created_at ?? ""));

    if (latestStatus === "none") {
      latestStatus = status;
    }

    if (status === "sent" || status === "sending" || status === "failed") {
      intake.requestedAt = createdAt;
    }

    if (status.endsWith("_submitted") || status === "submitted") {
      intake.answeredAt = intake.answeredAt === "-" ? createdAt : intake.answeredAt;
    }

    if (status === "profile_submitted" || status === "submitted") {
      submittedSections.add("profile");
    }

    if (status === "socials_submitted" || status === "submitted") {
      submittedSections.add("socials");
    }

    if (status === "gaming_submitted" || status === "submitted") {
      submittedSections.add("gaming");
    }

    mergeIntakeAnswers(intake, answers);
  }

  if (submittedSections.size >= 3 || latestStatus === "submitted") {
    latestStatus = "submitted";
  } else if (submittedSections.size > 0) {
    latestStatus = "partial";
  }

  intake.raw = rows.map((row) => String(row.new_value ?? "")).filter(Boolean).join("\n");
  intake.status = latestStatus;
  intake.statusLabel = mapMemberIntakeStatus(latestStatus);

  return intake;
}

function mergeIntakeAnswers(
  intake: WorkspaceMemberIntake,
  answers: Record<string, unknown>,
) {
  const keys = [
    "age",
    "ea",
    "instagram",
    "name",
    "notes",
    "profession",
    "residence",
    "snapchat",
    "stream",
    "tiktok",
    "ubisoft",
  ] as const;

  for (const key of keys) {
    const value = String(answers[key] ?? "").trim();

    if (value && !intake.answers[key]) {
      intake.answers[key] = value;
    }
  }

  const legacyOtherInfo = String(answers.otherInfo ?? "").trim();

  if (legacyOtherInfo && !intake.answers.notes) {
    intake.answers.notes = legacyOtherInfo;
  }
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

function mapFolders(
  rows: Record<string, unknown>[],
  driveMetaById = new Map<string, Record<string, unknown>>(),
): WorkspaceFolder[] {
  return rows.flatMap((row) => {
    const id = String(row.id ?? "");
    const driveMeta = driveMetaById.get(id) ?? {};

    if (driveMeta.deleted_at) {
      return [];
    }

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
      id,
      categoryId: String(row.category_id ?? ""),
      category: String(asObject(row.file_categories)?.name ?? "-"),
      folder: String(row.name ?? "Ordner"),
      googleDriveFolderId: String(
        driveMeta.google_drive_folder_id ?? row.google_drive_folder_id ?? "",
      ),
      parentFolderId: String(row.parent_folder_id ?? ""),
      permissions,
      syncStatus: String(driveMeta.sync_status ?? row.sync_status ?? "needs_review"),
      syncStatusLabel: mapDriveSyncEntityStatus(
        String(driveMeta.sync_status ?? row.sync_status ?? "needs_review"),
      ),
      visibleFor: viewRoles.join(", ") || "Nicht gesetzt",
      uploadFor: uploadRoles.join(", ") || "Nicht gesetzt",
      files: asArray(row.files).length,
    };
  });
}

function mapFiles(
  rows: Record<string, unknown>[],
  driveMetaById = new Map<string, Record<string, unknown>>(),
): WorkspaceFile[] {
  return rows.flatMap((row) => {
    const id = String(row.id ?? "");
    const driveMeta = driveMetaById.get(id) ?? {};

    if (driveMeta.deleted_at) {
      return [];
    }

    const category = asObject(row.file_categories);
    const folder = asObject(row.folders);
    const size = Number(row.file_size ?? 0);
    const originalName = String(
      row.original_filename ?? row.filename ?? "Datei",
    );

    return {
      id,
      categoryId: String(row.category_id ?? ""),
      category: String(category.name ?? "-"),
      createdAt: formatDate(String(row.created_at ?? "")),
      description: String(row.description ?? ""),
      externalUrl: String(row.external_url ?? ""),
      folder: String(folder.name ?? "-"),
      folderId: String(row.folder_id ?? ""),
      googleDriveFileId: String(
        driveMeta.google_drive_file_id ?? row.google_drive_file_id ?? row.source_id ?? "",
      ),
      googleDrivePreviewLink: String(
        driveMeta.google_drive_preview_link ?? row.google_drive_preview_link ?? "",
      ),
      googleDriveWebViewLink: String(
        driveMeta.google_drive_web_view_link ??
          row.google_drive_web_view_link ??
          row.external_url ??
          "",
      ),
      name: String(row.filename ?? originalName),
      isGoogleDoc: Boolean(driveMeta.is_google_doc ?? row.is_google_doc),
      originalName,
      size,
      sizeLabel: formatFileSize(size),
      source: String(row.source ?? "supabase"),
      storagePath: String(row.storage_path ?? ""),
      syncStatus: String(driveMeta.sync_status ?? row.sync_status ?? "needs_review"),
      syncStatusLabel: mapDriveSyncEntityStatus(
        String(driveMeta.sync_status ?? row.sync_status ?? "needs_review"),
      ),
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

function mapDiscordRoles(rows: Record<string, unknown>[]): WorkspaceDiscordRoleOption[] {
  return rows
    .map((row) => ({
      discordRoleId: String(row.discord_role_id ?? ""),
      id: String(row.id ?? ""),
      name: String(row.role_name ?? row.discord_role_id ?? "Discord-Rolle"),
    }))
    .filter((role) => role.id && role.discordRoleId);
}

function mapMinistryRoles(
  rows: Record<string, unknown>[],
): WorkspaceRepresentationMinistryRole[] {
  return rows
    .map((row) => ({
      active: Boolean(row.active ?? true),
      discordRoleId: String(row.discord_role_id ?? ""),
      id: String(row.id ?? ""),
      name: String(row.name ?? "Amtsrolle"),
      sortOrder: Number(row.sort_order ?? 100),
    }))
    .filter((role) => role.id && role.discordRoleId);
}

function mapRepresentationEligibilities(
  rows: Record<string, unknown>[],
): WorkspaceRepresentationEligibility[] {
  return rows
    .map((row) => {
      const member = asObject(row.members);
      const roleLinks = asArray(row.representation_eligibility_ministry_roles);
      const allowedMinistryRoleIds = roleLinks
        .map((entry) => String(entry.ministry_role_id ?? ""))
        .filter(Boolean);
      const allowedMinistryRoles = roleLinks
        .map((entry) =>
          String(
            asObject(entry.representation_ministry_roles)?.name ??
              entry.ministry_role_id ??
              "",
          ),
        )
        .filter(Boolean);

      return {
        active: Boolean(row.active ?? true),
        allowedMinistryRoleIds,
        allowedMinistryRoles,
        discordId: String(
          member.discord_id ?? row.representative_discord_id ?? "",
        ),
        id: String(row.id ?? ""),
        memberId: String(row.representative_member_id ?? member.id ?? ""),
        memberName: String(
          member.name ??
            member.discord_display_name ??
            member.discord_username ??
            row.representative_discord_id ??
            "Vertretung",
        ),
        notes: String(row.notes ?? ""),
        priority: Number(row.priority ?? 100),
      };
    })
    .filter((eligibility) => eligibility.id && eligibility.memberId);
}

function mapAbsences(rows: Record<string, unknown>[]): WorkspaceMemberAbsence[] {
  return rows
    .map((row) => {
      const member = asObject(row.members);
      const representations = asArray(row.member_absence_representations)
        .map((entry) => mapAbsenceRepresentation(asObject(entry)))
        .filter((entry) => entry.id);

      return {
        discordId: String(member.discord_id ?? row.discord_user_id ?? ""),
        endedAt: formatDate(String(row.ended_at ?? "")),
        endedBy: String(row.ended_by_name ?? "-"),
        endReason: String(row.end_reason ?? ""),
        expectedReturnAt: formatDate(String(row.expected_return_at ?? "")),
        id: String(row.id ?? ""),
        memberId: String(row.member_id ?? member.id ?? ""),
        memberName: String(
          member.name ??
            member.discord_display_name ??
            member.discord_username ??
            row.discord_user_id ??
            "Abmeldung",
        ),
        reason: String(row.reason ?? "-"),
        representations,
        requestedBy: String(row.requested_by_name ?? "-"),
        startedAt: formatDate(String(row.started_at ?? "")),
        status: String(row.status ?? "active"),
        statusLabel: mapAbsenceStatus(String(row.status ?? "active")),
      };
    })
    .filter((absence) => absence.id);
}

function mapAbsenceRepresentation(
  row: Record<string, unknown>,
): WorkspaceAbsenceRepresentation {
  const representative = asObject(row.representative);

  return {
    assignedAt: formatDate(String(row.assigned_at ?? "")),
    approvalRequestedAt: formatDate(String(row.approval_requested_at ?? "")),
    approvalRespondedAt: formatDate(String(row.approval_responded_at ?? "")),
    approvalStatus: String(row.approval_status ?? "pending"),
    botError: String(row.bot_error ?? ""),
    discordRoleId: String(row.discord_role_id ?? ""),
    id: String(row.id ?? ""),
    ministryRoleName: String(row.ministry_role_name ?? "Amtsrolle"),
    removedAt: formatDate(String(row.removed_at ?? "")),
    representativeDiscordId: String(
      representative.discord_id ?? row.representative_discord_id ?? "",
    ),
    representativeHadRoleBefore: Boolean(row.representative_had_role_before),
    representativeMemberId: String(row.representative_member_id ?? representative.id ?? ""),
    representativeName: String(
      representative.name ??
        representative.discord_display_name ??
        representative.discord_username ??
        row.representative_discord_id ??
        "Keine Vertretung",
    ),
    roleWasAssignedAutomatically: Boolean(row.role_was_assigned_automatically),
    status: String(row.status ?? "pending"),
    statusLabel: mapRepresentationStatus(
      String(row.status ?? "pending"),
      String(row.approval_status ?? "pending"),
      String(row.approval_requested_at ?? ""),
    ),
  };
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
  return rows
    .map((row) => {
    const member = asObject(row.members);
    const metadata = asObject(row.metadata);
    const commandStatus = String(metadata.commandStatus ?? "");
    const commandError = String(metadata.botError ?? metadata.dmError ?? "");
    const eventType = String(row.event_type ?? "kick");
    const storedStatus = String(row.status ?? "recorded");
    const status =
      commandStatus === "pending" || commandStatus === "running"
        ? commandStatus
        : storedStatus;
    const source = String(row.source ?? "");
    const moderator = String(row.moderator_name ?? "-");
    const moderatorDiscordId = String(row.moderator_discord_id ?? "");

    if (isHiddenBotModerationEvent(source, moderator, moderatorDiscordId)) {
      return null;
    }

    const durationSeconds =
      row.duration_seconds === null || row.duration_seconds === undefined
        ? null
        : Number(row.duration_seconds);
    const endedAt = String(row.ended_at ?? "");
    const durationMode = String(metadata.durationMode ?? "");
    const metadataLifetime =
      metadata.lifetime === true || metadata.lifetime === "true";
    const lifetime =
      metadataLifetime ||
      (eventType === "ban" && durationSeconds === null && !endedAt);

    return {
      id: String(row.id ?? ""),
      commandError,
      commandStatus,
      durationSeconds,
      durationMode,
      eventType,
      eventTypeLabel: mapModerationEventType(eventType),
      lifetime,
      memberId: String(row.member_id ?? ""),
      status,
      statusLabel: mapModerationStatus(status),
      memberName: String(member.name ?? row.discord_username ?? "Unbekannt"),
      discordId: String(member.discord_id ?? row.discord_user_id ?? "-"),
      discordName: String(row.discord_username ?? "-"),
      moderator,
      moderatorDiscordId,
      channel: String(row.channel_name ?? "-"),
      reason: String(row.reason ?? "-"),
      source,
      startedAt: formatDate(String(row.started_at ?? "")),
      endedAt: formatDate(endedAt),
      totalDuration: lifetime
        ? "Lifetime"
        : formatDurationSeconds(durationSeconds, eventType),
      remainingDuration:
        lifetime && status === "active"
          ? "Dauerhaft"
          : formatRemainingDuration(endedAt, status, eventType),
    };
  })
  .filter((event): event is WorkspaceModerationEvent => Boolean(event));
}

function mapModerationAdviceCases(
  rows: Record<string, unknown>[],
): WorkspaceModerationAdviceCase[] {
  return rows.map((row) => {
    const targetMember = asObject(row.target_member);
    const aiOutput = asObject(row.ai_output);
    const evidenceRows = asArray(row.moderation_advice_evidence);
    const logRows = asArray(row.moderation_advice_logs);
    const officialDocuments = asArray(row.moderation_advice_official_documents);
    const officialDocument = officialDocuments
      .map(asObject)
      .sort((left, right) =>
        String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")),
      )[0] ?? {};
    const officialFile = asObject(officialDocument.files);
    const officialMetadata = asObject(officialDocument.metadata);
    const status = String(row.status ?? "draft");
    const recommendedAction = String(
      row.recommended_action ?? aiOutput.recommendedAction ?? "",
    );

    return {
      affectedPeople: String(row.affected_people ?? ""),
      aiOutput,
      archivedAt: formatDate(String(row.archived_at ?? "")),
      behaviorSummary: String(row.behavior_summary ?? ""),
      caseNumber: String(row.case_number ?? "-"),
      confidence: readOptionalNumber(row.confidence),
      createdAt: formatDate(String(row.created_at ?? "")),
      desiredOutcome: String(row.desired_outcome ?? ""),
      evidence: evidenceRows
        .map((evidence) => ({
          createdAt: formatDate(String(evidence.created_at ?? "")),
          description: String(evidence.description ?? ""),
          evidenceType: String(evidence.evidence_type ?? "other"),
          externalUrl: String(evidence.external_url ?? ""),
          id: String(evidence.id ?? ""),
          label: String(evidence.label ?? "Beleg"),
          metadata: asObject(evidence.metadata),
          signedUrl: "",
        }))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      evidenceSummary: asObject(row.evidence_summary),
      executed: Boolean(row.execution_event_id || row.executed_at || status === "executed"),
      executedAt: formatDate(String(row.executed_at ?? "")),
      executionEventId: String(row.execution_event_id ?? ""),
      id: String(row.id ?? ""),
      incidentAt: formatDate(String(row.incident_at ?? "")),
      internalNotes: String(row.internal_notes ?? ""),
      legalBasisSnapshot: asObject(row.legal_basis_snapshot),
      logs: logRows
        .map((log) => ({
          action: String(log.action ?? ""),
          createdAt: formatDate(String(log.created_at ?? "")),
          details: asObject(log.details),
          id: String(log.id ?? ""),
        }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      modelName: String(row.model_name ?? ""),
      modelProvider: String(row.model_provider ?? ""),
      officialAz: String(row.official_az ?? officialDocument.az ?? ""),
      officialDocumentCreatedAt: formatDate(String(officialDocument.created_at ?? "")),
      officialDocumentFileId: String(officialDocument.file_id ?? ""),
      officialDocumentId: String(
        row.official_document_id ?? officialDocument.id ?? "",
      ),
      officialDocumentStatus: String(officialDocument.status ?? ""),
      officialDocumentUrl: String(
        officialFile.google_drive_web_view_link ??
          officialFile.external_url ??
          officialMetadata.documentUrl ??
          "",
      ),
      priorHistorySnapshot: asObject(row.prior_history_snapshot),
      recommendedAction,
      recommendedEventType: String(row.recommended_event_type ?? ""),
      recommendedReason: String(row.recommended_reason ?? ""),
      severityScore: readOptionalNumber(row.severity_score),
      situationText: String(row.situation_text ?? ""),
      status,
      statusLabel: mapAdviceStatus(status),
      targetDiscordId: String(
        targetMember.discord_id ?? row.target_discord_user_id ?? "-",
      ),
      targetDiscordUsername: String(
        targetMember.discord_display_name ??
          targetMember.discord_username ??
          row.target_discord_username ??
          "-",
      ),
      targetMemberId: String(targetMember.id ?? row.target_member_id ?? ""),
      targetName: String(
        targetMember.name ??
          targetMember.discord_display_name ??
          row.target_discord_username ??
          row.target_discord_user_id ??
          "Unbekannt",
      ),
      title: String(row.title ?? "Neue Beratung"),
      updatedAt: formatDate(String(row.updated_at ?? "")),
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

      if (row.two_factor_required === false) {
        summary.mfaRequirementDisabled += 1;
      } else {
        summary.mfaRequired += 1;
      }

      summary.rows.push({
        id: String(row.id ?? ""),
        displayName: String(row.display_name ?? row.email ?? "Benutzer"),
        email: String(row.email ?? "-"),
        status,
        statusLabel: mapUserStatus(status),
        twoFactorEnabled: Boolean(row.two_factor_enabled),
        twoFactorRequired: row.two_factor_required !== false,
        username: String(row.username ?? "-"),
        roles,
      });

      return summary;
    },
    {
      active: 0,
      disabled: 0,
      mfaEnabled: 0,
      mfaRequired: 0,
      mfaRequirementDisabled: 0,
      rows: [],
    },
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

function mapDriveSync(
  runs: Record<string, unknown>[],
  conflicts: Record<string, unknown>[],
): WorkspaceDriveSync {
  const latest = runs[0];
  const conflictRows = conflicts.map((row) => ({
    conflictType: String(row.conflict_type ?? ""),
    createdAt: formatDate(String(row.created_at ?? "")),
    entityType: String(row.entity_type ?? ""),
    googleDriveId: String(row.google_drive_id ?? ""),
    id: String(row.id ?? ""),
    localEntityId: String(row.local_entity_id ?? ""),
    status: String(row.status ?? "open"),
  }));
  const errorCount = latest
    ? Number(latest.errors_found ?? (latest.status === "failed" ? 1 : 0))
    : 0;

  return {
    configured: hasGoogleDriveServerConfig(),
    conflictCount: conflictRows.length,
    conflicts: conflictRows,
    errorCount,
    latestRunAt: latest
      ? formatLiveDate(String(latest.finished_at ?? latest.started_at ?? ""))
      : "Noch offen",
    latestStatus: latest
      ? mapDriveRunStatus(String(latest.status ?? "nicht gestartet"))
      : "nicht gestartet",
    nextScheduled: "06:00 / 20:00 Europe/Berlin",
  };
}

function mapSync(rows: Record<string, unknown>[]): WorkspaceSyncStatus {
  const liveRows = rows.filter((row) => String(row.source ?? "") === "discord-live");
  const latestLive = liveRows[0];
  const latest = latestLive ?? rows[0];
  const latestSource = String(latest?.source ?? "");
  const latestStatus = String(latest?.status ?? "nicht gestartet");
  const isRailwayLive =
    latestSource === "discord-live" ||
    String(asObject(latest?.metadata).implementation ?? "") ===
      "railway-discord-gateway";
  const errors = latestStatus === "failed" ? 1 : 0;
  const latestMetadata = asObject(latest?.metadata);
  const heartbeatMetadata = asObject(latestMetadata.heartbeat);
  const memberMetadata = asObject(latestMetadata.members);
  const heartbeatAt = String(heartbeatMetadata.lastSeenAt ?? "");
  const liveSignalAgeSeconds = getAgeSeconds(heartbeatAt);
  const liveSignalFresh =
    isRailwayLive &&
    liveSignalAgeSeconds !== null &&
    liveSignalAgeSeconds <= 45;
  const liveSignalAge =
    liveSignalAgeSeconds === null ? "-" : formatAgeShort(liveSignalAgeSeconds);
  const liveVoiceSessions = Number(heartbeatMetadata.activeVoiceSessions ?? 0);
  const moderationQueueSize = Number(heartbeatMetadata.moderationQueueSize ?? 0);
  const questionnaireQueueSize = Number(
    heartbeatMetadata.questionnaireQueueSize ?? 0,
  );
  const representationQueueSize = Number(
    heartbeatMetadata.representationQueueSize ?? 0,
  );
  const memberScanned = Number(memberMetadata.scanned ?? 0);
  const memberPageLimitHit = Boolean(memberMetadata.pageLimitHit);
  const memberSkippedBots = Number(memberMetadata.skippedBots ?? 0);
  const memberUpserted = Number(memberMetadata.upserted ?? 0);
  const memberServerEstimate = readOptionalNumber(
    memberMetadata.guildMemberEstimate,
  );
  const memberMissingEstimate = readOptionalNumber(memberMetadata.missingEstimate);
  const memberCoverageComplete =
    memberMetadata.coverageComplete === undefined
      ? !memberPageLimitHit
      : Boolean(memberMetadata.coverageComplete);
  const memberGuildName = String(memberMetadata.guildName ?? "-");
  const memberCoverageStatus =
    memberServerEstimate !== null
      ? memberCoverageComplete
        ? `${memberScanned}/${memberServerEstimate} Discord-Mitglieder erfasst`
        : `${memberScanned}/${memberServerEstimate} erfasst, ca. ${memberMissingEstimate ?? 0} offen`
      : memberPageLimitHit
        ? "Discord-Limit erreicht"
        : latest
          ? `${memberUpserted} Akten, ${memberSkippedBots} Bots uebersprungen`
          : "Schema vorbereitet";

  return {
    lastFullSync: latest
      ? formatLiveDate(
          isRailwayLive && heartbeatAt
            ? heartbeatAt
            : String(latest.finished_at ?? latest.started_at ?? ""),
        )
      : "Noch offen",
    errorCount: isRailwayLive ? (liveSignalFresh ? 0 : 1) : errors,
    liveSignalAge,
    liveSignalFresh,
    liveVoiceSessions,
    manualSync: isRailwayLive ? "Railway Live" : "Adminrecht",
    botState: latest
      ? isRailwayLive && latestStatus === "success" && liveSignalFresh
        ? "Online"
        : isRailwayLive
          ? "Kein Live-Signal"
        : mapSyncStatusLabel(latestStatus)
      : "nicht gestartet",
    memberCoverageComplete,
    memberGuildName,
    memberMissingEstimate,
    memberPageLimitHit,
    memberServerEstimate,
    memberScanned,
    memberSkippedBots,
    memberUpserted,
    moderationQueueSize,
    questionnaireQueueSize,
    representationQueueSize,
    rows: [
      {
        label: "Gateway-Herzschlag",
        status: liveSignalFresh
          ? `Live-Signal ${liveSignalAge}`
          : isRailwayLive
            ? `Kein frisches Signal (${liveSignalAge})`
            : "Wartet auf Railway",
        active: liveSignalFresh,
      },
      {
        label: "Rollen-Sync",
        status: liveSignalFresh
          ? "Railway Rollenabgleich aktiv"
          : latest
            ? "Letzter Lauf vorhanden"
            : "Schema vorbereitet",
        active: liveSignalFresh || !isRailwayLive,
      },
      {
        label: "Neue Mitglieder",
        status: memberCoverageStatus,
        active: memberCoverageComplete,
      },
      {
        label: "Nachrichtenzaehler",
        status: liveSignalFresh
          ? "Gateway zaehlt neue Nachrichten live"
          : "Monatsmodell vorbereitet",
        active: liveSignalFresh || !isRailwayLive,
      },
      {
        label: "Voice-Sessions",
        status: liveSignalFresh
          ? `${liveVoiceSessions} aktive Voice-Sessions`
          : "Tabellen vorbereitet",
        active: liveSignalFresh || !isRailwayLive,
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
        label: "Aktenbogen-DMs",
        status: liveSignalFresh
          ? questionnaireQueueSize > 0
            ? `${questionnaireQueueSize} offene Anfragen`
            : "Bot-Abfrage live verbunden"
          : "DM-Abfrage vorbereitet",
        active: liveSignalFresh || !isRailwayLive,
      },
      {
        label: "Moderationsregister",
        status: liveSignalFresh
          ? moderationQueueSize > 0
            ? `${moderationQueueSize} offene Bot-Auftraege`
            : "Bot-Auftraege live verbunden"
          : "Datenbankregister vorbereitet",
        active: liveSignalFresh || !isRailwayLive,
      },
      {
        label: "Amtsvertretung",
        status: liveSignalFresh
          ? representationQueueSize > 0
            ? `${representationQueueSize} offene Rollen-Auftraege`
            : "Vertretungsrollen live verbunden"
          : "Vertretungsregister vorbereitet",
        active: liveSignalFresh || !isRailwayLive,
      },
      {
        label: "Bot-Implementierung",
        status: liveSignalFresh
          ? "Railway Gateway online"
          : isRailwayLive
            ? "Railway Gateway ohne frisches Signal"
          : latest
            ? "Alter REST-Sync erkannt"
            : "Live-Sync vorbereitet",
        active: liveSignalFresh,
      },
    ],
  };
}

function mapSyncStatusLabel(status: string) {
  const labels: Record<string, string> = {
    failed: "Fehler",
    partial: "Teilweise",
    success: "Online",
  };

  return labels[status] ?? status;
}

function mapDriveRunStatus(status: string) {
  const labels: Record<string, string> = {
    failed: "Fehler",
    partial: "Teilweise",
    running: "Laeuft",
    skipped: "Uebersprungen",
    success: "Synchronisiert",
  };

  return labels[status] ?? status;
}

function mapDriveSyncEntityStatus(status: string) {
  const labels: Record<string, string> = {
    conflict: "Konflikt",
    failed: "Fehler",
    needs_review: "Zu pruefen",
    orphaned: "Verwaist",
    pending_download: "Download offen",
    pending_move: "Verschieben offen",
    pending_upload: "Upload offen",
    synced: "Synchronisiert",
  };

  return labels[status] ?? status;
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

function mapMemberIntakeStatus(status: string) {
  const labels: Record<string, string> = {
    failed: "DM fehlgeschlagen",
    gaming_submitted: "Gaming eingereicht",
    none: "Nicht angefragt",
    partial: "Teilweise eingereicht",
    profile_submitted: "Basisdaten eingereicht",
    sending: "Wird gesendet",
    sent: "DM gesendet",
    skipped: "Uebersprungen",
    socials_submitted: "Socials eingereicht",
    submitted: "Eingereicht - Pruefung",
  };

  return labels[status] ?? status;
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

function mapAbsenceStatus(status: string) {
  const labels: Record<string, string> = {
    active: "Aktiv",
    ended: "Beendet",
    ending: "Rueckbau laeuft",
    failed: "Fehler",
  };

  return labels[status] ?? status;
}

function mapRepresentationStatus(
  status: string,
  approvalStatus = "accepted",
  approvalRequestedAt = "",
) {
  if (status === "pending") {
    if (approvalStatus === "pending") {
      return approvalRequestedAt ? "Zustimmung offen" : "DM wird vorbereitet";
    }

    if (approvalStatus === "accepted") {
      return "Zugestimmt";
    }

    if (approvalStatus === "declined") {
      return "Abgelehnt";
    }
  }

  const labels: Record<string, string> = {
    active: "Aktiv",
    assigning: "Wird gesetzt",
    ended: "Beendet",
    ending: "Wird entfernt",
    failed: "Fehler",
    pending: "Wartet auf Bot",
    skipped: "Uebersprungen",
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
    pending: "Wartet",
    recorded: "Erfasst",
    running: "Laeuft",
  };

  return labels[status] ?? status;
}

function mapAdviceStatus(status: string) {
  const labels: Record<string, string> = {
    advice_ready: "Empfehlung bereit",
    analyzing: "KI prueft",
    cancelled: "Abgebrochen",
    draft: "Entwurf",
    executed: "Ausgefuehrt",
    failed: "Fehler",
    queued: "Bot wartet",
    saved: "Gespeichert",
  };

  return labels[status] ?? status;
}

function isHiddenBotModerationEvent(
  source: string,
  moderator: string,
  moderatorDiscordId: string,
) {
  if (source !== "discord-audit-log") {
    return false;
  }

  const normalizedName = moderator.toLowerCase();
  const knownBotNames = ["overdrive", "schland-music", "quark logger"];

  return (
    knownBotNames.includes(normalizedName) ||
    normalizedName.includes(" bot") ||
    normalizedName.endsWith("bot") ||
    normalizedName.includes("logger") ||
    normalizedName.includes("music") ||
    moderatorDiscordId === process.env.DISCORD_BOT_USER_ID
  );
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
    timeZone: displayTimeZone,
    timeStyle: "short",
  }).format(date);
}

function formatLiveDate(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeZone: displayTimeZone,
    timeStyle: "medium",
  }).format(date);
}

function getAgeSeconds(value: string) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - time) / 1000));
}

function formatAgeShort(seconds: number) {
  if (seconds < 5) {
    return "gerade eben";
  }

  if (seconds < 60) {
    return `vor ${seconds} Sek.`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `vor ${minutes} Min.`;
  }

  const hours = Math.floor(minutes / 60);

  return `vor ${hours} Std.`;
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

function readOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  const text = String(value ?? "").trim();

  if (!text) {
    return {};
  }

  try {
    return asObject(JSON.parse(text));
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
