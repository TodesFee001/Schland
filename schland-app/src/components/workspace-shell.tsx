"use client";

import {
  Activity,
  Bell,
  Bot,
  BrainCircuit,
  CalendarOff,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  Flame,
  Eye,
  ExternalLink,
  FileText,
  Folder,
  Gauge,
  KeyRound,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  RefreshCw,
  Siren,
  Trash2,
  TriangleAlert,
  Upload,
  UserCog,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  activateLockdownAction,
  activateTemporaryDesignTemplateAction,
  analyzeModerationAdviceCaseAction,
  createGoogleDocAction,
  createDiscordInviteRequestAction,
  createFolderAction,
  deactivateLockdownAction,
  deleteDiscordInviteRequestAction,
  createModerationAdviceCaseAction,
  createModerationAdviceOfficialDocumentAction,
  createMemberAction,
  deleteFileAction,
  deleteFolderAction,
  deleteMemberCaseAction,
  deleteModerationEventAction,
  downloadFileAction,
  endMemberAbsenceAction,
  linkMemberFileAction,
  moveFileAction,
  openMemberCaseAction,
  executeModerationAdviceAction,
  prepareModerationAdviceEvidenceUploadAction,
  resetTemporaryDesignSettingsAction,
  runModerationAction,
  runDiscordManualSyncAction,
  runDriveManualSyncAction,
  saveCategoryAction,
  saveModerationAdviceCaseAction,
  saveRepresentationEligibilityAction,
  saveRepresentationMinistryRoleAction,
  saveRoleAction,
  saveTemporaryDesignSettingsAction,
  saveTemporaryDesignTemplateAction,
  startMemberAbsenceAction,
  setMemberDiscordAnalyticsAction,
  setFolderPermissionAction,
  setRolePermissionAction,
  setUserTwoFactorRequirementAction,
  setUserRoleAction,
  unlinkMemberFileAction,
  updateMemberCaseAction,
  updateModerationAdviceTitleAction,
  updateModerationEventAction,
  uploadMemberProfileImageAction,
  uploadFileAction,
} from "@/app/actions";
import type { AuthStatus } from "@/lib/auth";
import type { DashboardSnapshot } from "@/lib/dashboard";
import type { EnvironmentStatus } from "@/lib/env";
import { patchNotes } from "@/lib/patch-notes";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  ActiveTemporaryDesign,
  TemporaryDesignState,
  TemporaryDesignTemplate,
} from "@/lib/temporary-designs";
import type {
  MemberStatusLabel,
  WorkspaceAbsenceRepresentation,
  WorkspaceCategory,
  WorkspaceData,
  WorkspaceDiscordInvite,
  WorkspaceDriveSync,
  WorkspaceDiscordRoleOption,
  WorkspaceFile,
  WorkspaceFolder,
  WorkspaceFolderPermission,
  WorkspaceLogRow,
  WorkspaceMember,
  WorkspaceMemberAbsence,
  WorkspaceModerationAdviceCase,
  WorkspaceModerationEvent,
  WorkspacePermissionOption,
  WorkspaceRepresentationEligibility,
  WorkspaceRepresentationMinistryRole,
  WorkspaceRoleRow,
  WorkspaceSyncStatus,
  WorkspaceUserSummary,
} from "@/lib/workspace-data";
import type { LockdownStatus } from "@/lib/lockdown";

type SectionId =
  | "dashboard"
  | "members"
  | "files"
  | "categories"
  | "users"
  | "roles"
  | "representation"
  | "activity"
  | "moderation"
  | "advice"
  | "sync"
  | "settings";

type Section = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
};

type WorkspaceShellProps = {
  authStatus: AuthStatus;
  dashboardSnapshot: DashboardSnapshot;
  environmentStatus: EnvironmentStatus;
  initialSelectedAdviceCaseId?: string;
  initialSelectedMemberId?: string;
  initialSection?: string;
  setupNotice?: SetupNotice;
  workspaceData: WorkspaceData;
};

type DashboardMetric = {
  change: string;
  icon: LucideIcon;
  label: string;
  value: string;
};

type SetupNotice = {
  tone: "error" | "success" | "warning";
  text: string;
};

type WorkspaceNotification = {
  detail: string;
  id: string;
  section: SectionId;
  title: string;
  tone: "error" | "info" | "warning";
};

type AdviceUploadEvidenceType = "file" | "screenshot";

type AdviceUploadItem = {
  contentType: string;
  error?: string;
  evidenceType: AdviceUploadEvidenceType;
  extractedText: string;
  id: string;
  originalName: string;
  size: number;
  status: "failed" | "queued" | "uploaded" | "uploading";
  storagePath?: string;
};

const sections: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "members", label: "Mitgliederakten", icon: Shield },
  { id: "files", label: "Datei-Datenbank", icon: FileText },
  { id: "categories", label: "Kategorien", icon: Folder },
  { id: "users", label: "Benutzer", icon: Users },
  { id: "roles", label: "Rollen & Rechte", icon: KeyRound },
  { id: "representation", label: "Amtsvertretung", icon: UserCheck },
  { id: "activity", label: "Aktivitaet", icon: Activity },
  { id: "moderation", label: "Moderation", icon: Shield },
  { id: "advice", label: "KI-Sanktionsberater", icon: BrainCircuit },
  { id: "sync", label: "Synchronisation", icon: Bot },
  { id: "settings", label: "Einstellungen", icon: Settings },
];

const ADVICE_UPLOAD_MAX_FILES = 20;
const ADVICE_UPLOAD_MAX_FILE_BYTES = 20 * 1024 * 1024;
const ADVICE_UPLOAD_MAX_TOTAL_BYTES = 45 * 1024 * 1024;
const ADVICE_EVIDENCE_FILE_ACCEPT =
  "image/*,.pdf,.txt,.md,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.doc,.docx,.rtf,.odt,.ppt,.pptx,.xls,.xlsx";

const rootRoleKey = "root_owner";
const platformAdminRoleKey = "platform_admin";
const protectedActiveRoleKeys = new Set([rootRoleKey, platformAdminRoleKey]);
const readonlyRoleKeys = new Set([rootRoleKey, platformAdminRoleKey]);
const platformAdminCorePermissionKeys = new Set([
  "app.enter",
  "users.view",
  "users.create",
  "users.update",
  "users.deactivate",
  "users.assign_roles",
  "roles.view",
  "roles.manage",
  "permissions.view",
]);

export function WorkspaceShell({
  authStatus,
  dashboardSnapshot,
  environmentStatus,
  initialSelectedAdviceCaseId,
  initialSelectedMemberId,
  initialSection,
  setupNotice,
  workspaceData,
}: WorkspaceShellProps) {
  const router = useRouter();
  const members = workspaceData.members;
  const [activeSection, setActiveSection] = useState<SectionId>(
    isSectionId(initialSection) ? initialSection : "dashboard",
  );
  const openedAdviceCaseId = workspaceData.moderationAdviceCases.some(
    (adviceCase) => adviceCase.id === initialSelectedAdviceCaseId,
  )
    ? String(initialSelectedAdviceCaseId)
    : "";
  const [selectedAdviceCaseId, setSelectedAdviceCaseId] = useState("");
  const openedMemberId = members.some((member) => member.id === initialSelectedMemberId)
    ? String(initialSelectedMemberId)
    : "";
  const [memberSearch, setMemberSearch] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [selectedMemberOverride, setSelectedMemberId] = useState("");
  const [caseDetailsSuppressed, setCaseDetailsSuppressed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const [temporaryDesignPreviewKey, setTemporaryDesignPreviewKey] = useState("");
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const [sessionRemainingSeconds, setSessionRemainingSeconds] = useState<
    number | null
  >(authStatus.sessionRemainingSeconds ?? null);
  const selectedMemberId = members.some(
    (member) => member.id === selectedMemberOverride,
  )
    ? selectedMemberOverride
    : openedMemberId || members[0]?.id || "";
  const selectedAdviceId = workspaceData.moderationAdviceCases.some(
    (adviceCase) => adviceCase.id === selectedAdviceCaseId,
  )
    ? selectedAdviceCaseId
    : openedAdviceCaseId || workspaceData.moderationAdviceCases[0]?.id || "";

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();

    if (!query) {
      return members;
    }

    return members.filter((member) =>
      [
        member.id,
        member.name,
        member.discordId,
        member.discordName,
        member.displayName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [memberSearch, members]);

  const selectedMember =
    members.find((member) => member.id === selectedMemberId) ?? members[0] ?? null;

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [router]);

  useEffect(() => {
    if (!authStatus.signedIn || !authStatus.sessionExpiresAt) {
      return;
    }

    function updateRemainingTime() {
      const expiresAt = new Date(String(authStatus.sessionExpiresAt)).getTime();
      const remaining = Math.max(
        Math.ceil((expiresAt - Date.now()) / 1000),
        0,
      );

      setSessionRemainingSeconds(remaining);

      if (remaining === 0) {
        router.refresh();
      }
    }

    updateRemainingTime();
    const interval = window.setInterval(updateRemainingTime, 1000);

    return () => window.clearInterval(interval);
  }, [authStatus.sessionExpiresAt, authStatus.signedIn, router]);

  const mfaReady = authStatus.mfaLevel === "aal2";
  const canViewSelectedMember =
    mfaReady &&
    Boolean(openedMemberId) &&
    !caseDetailsSuppressed &&
    selectedMember?.id === openedMemberId;
  const activeLabel =
    sections.find((section) => section.id === activeSection)?.label ??
    "Dashboard";
  const userLabel = authStatus.email ?? (authStatus.configured ? "Benutzer" : "Demo");
  const dashboardMetrics = useMemo<DashboardMetric[]>(
    () => [
      {
        label: "Mitgliederakten",
        value: formatNumber(dashboardSnapshot.membersCount),
        change: dashboardSnapshot.source === "supabase" ? "live" : "+6",
        icon: Shield,
      },
      {
        label: "Dateien",
        value: formatNumber(dashboardSnapshot.filesCount),
        change: dashboardSnapshot.source === "supabase" ? "live" : "+18",
        icon: FileText,
      },
      {
        label: "Aktive Rollen",
        value: formatNumber(dashboardSnapshot.rolesCount),
        change: dashboardSnapshot.source === "supabase" ? "live" : "admin",
        icon: KeyRound,
      },
      {
        label: "Voice-Stunden",
        value: formatNumber(dashboardSnapshot.voiceHoursMonth),
        change: "Monat",
        icon: Activity,
      },
    ],
    [dashboardSnapshot],
  );
  const notifications = useMemo(
    () =>
      buildWorkspaceNotifications({
        authStatus,
        environmentStatus,
        mfaReady,
        setupNotice,
        workspaceData,
      }),
    [authStatus, environmentStatus, mfaReady, setupNotice, workspaceData],
  );
  const visibleNotifications = useMemo(
    () =>
      notifications.filter(
        (notification) => !dismissedNotificationIds.includes(notification.id),
      ),
    [dismissedNotificationIds, notifications],
  );
  const notificationCountLabel =
    visibleNotifications.length > 99
      ? "99+"
      : formatNumber(visibleNotifications.length);
  const latestPatchVersion = patchNotes[0]?.version ?? "-";
  const latestPatchTitle = patchNotes[0]?.title ?? "Keine Patchnotes";
  const previewTemplate =
    workspaceData.temporaryDesigns.templates.find(
      (template) => template.key === temporaryDesignPreviewKey,
    ) ?? null;
  const renderedTemporaryDesign: ActiveTemporaryDesign = previewTemplate
    ? {
        key: previewTemplate.key,
        name: previewTemplate.name,
        source: "manual",
        theme: previewTemplate.theme,
      }
    : workspaceData.temporaryDesigns.activeDesign;
  const temporaryDesignStyle = {
    "--accent": renderedTemporaryDesign.theme.accentColor,
    "--accent-soft": renderedTemporaryDesign.theme.accentSoftColor,
    "--accent-strong": renderedTemporaryDesign.theme.accentStrongColor,
    "--background": renderedTemporaryDesign.theme.backgroundColor,
    "--button": renderedTemporaryDesign.theme.buttonColor,
  } as CSSProperties;

  return (
    <main
      className={[
        "temporary-design-shell min-h-screen bg-[var(--background)] text-[var(--foreground)]",
        renderedTemporaryDesign.theme.backgroundClass,
      ].join(" ")}
      style={temporaryDesignStyle}
    >
      <TemporaryDesignAtmosphere design={renderedTemporaryDesign} />
      <TemporaryDesignBanner
        design={renderedTemporaryDesign}
        preview={Boolean(previewTemplate)}
      />
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[230px_1fr]">
        <aside className="border-b border-[var(--line-strong)] bg-[var(--surface-muted)] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-4 p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center border border-[var(--line-strong)] bg-[var(--accent)] text-white">
                <Database className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold uppercase">Schland DB</p>
                <p className="text-xs text-neutral-600">Verwaltung</p>
              </div>
            </div>

            <nav className="grid gap-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    title={section.label}
                    onClick={() => setActiveSection(section.id)}
                    className={[
                      "flex h-9 items-center gap-2 border px-2 text-left text-sm transition",
                      isActive
                        ? "border-[var(--line-strong)] bg-[var(--accent)] text-white"
                        : "border-transparent text-neutral-800 hover:border-[var(--line)] hover:bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{section.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border border-[var(--line-strong)] bg-[var(--surface)] p-3">
              <div className="mb-3 flex items-center gap-2">
                <Lock className="size-4 text-[var(--accent)]" aria-hidden="true" />
                <span className="text-sm font-medium">Akten-Schutz</span>
              </div>
              <div className="grid gap-2 text-xs text-neutral-600">
                <StatusLine active label="Rollenpruefung" />
                <StatusLine active label="2FA Pflicht" />
                <StatusLine active label="Zugriffsgrund" />
                <StatusLine active label="Aktenprotokoll" />
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3 md:px-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-neutral-500">
                  Interne Verwaltung
                </p>
                <h1 className="text-xl font-semibold md:text-2xl">
                  {activeLabel}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <EnvironmentPill
                  active={
                    environmentStatus.supabaseUrl &&
                    environmentStatus.supabasePublishableKey
                  }
                  label="Supabase"
                />
                <EnvironmentPill active={environmentStatus.vercel} label="Vercel" />
                {authStatus.signedIn ? (
                  <EnvironmentPill
                    active={authStatus.mfaLevel === "aal2"}
                    label={
                      authStatus.mfaRequired === false
                        ? "2FA Pflicht aus"
                        : authStatus.mfaLevel === "aal2"
                          ? "2FA aktiv"
                          : "2FA offen"
                    }
                  />
                ) : null}
                {authStatus.signedIn && sessionRemainingSeconds !== null ? (
                  <SessionTimerPill remainingSeconds={sessionRemainingSeconds} />
                ) : null}
                <button
                  type="button"
                  title={`Patchnotes oeffnen: ${latestPatchTitle}`}
                  aria-haspopup="dialog"
                  aria-expanded={patchNotesOpen}
                  onClick={() => setPatchNotesOpen((open) => !open)}
                  className={[
                    "flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium",
                    patchNotesOpen
                      ? "border-[var(--line-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                      : "border-[var(--line)] bg-[var(--surface)]",
                  ].join(" ")}
                >
                  <FileText className="size-4" aria-hidden="true" />
                  <span>Patchnotes</span>
                  <span className="border border-current px-1.5 py-0.5 font-mono text-xs">
                    {latestPatchVersion}
                  </span>
                </button>
                <div className="relative">
                  <button
                    type="button"
                    title="Benachrichtigungen"
                    aria-expanded={notificationsOpen}
                    onClick={() => setNotificationsOpen((open) => !open)}
                    className={[
                      "flex h-9 items-center gap-2 rounded-md border px-3 text-sm",
                      notificationsOpen
                        ? "border-[var(--line-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        : "border-[var(--line)] bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    <Bell className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {notificationCountLabel}
                    </span>
                  </button>

                  {notificationsOpen ? (
                    <div className="absolute right-0 top-11 z-30 w-[min(92vw,380px)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[6px_6px_0_rgba(0,0,0,0.18)]">
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2">
                        <div>
                          <p className="text-sm font-bold">Benachrichtigungen</p>
                          <p className="text-xs text-neutral-600">
                            {visibleNotifications.length > 0
                              ? `${notificationCountLabel} offen`
                              : "Alles ruhig"}
                          </p>
                        </div>
                        {visibleNotifications.length > 0 ? (
                          <button
                            type="button"
                            title="Alle als gelesen markieren"
                            onClick={() =>
                              setDismissedNotificationIds((current) => [
                                ...new Set([
                                  ...current,
                                  ...notifications.map((notification) => notification.id),
                                ]),
                              ])
                            }
                            className="h-8 border border-[var(--line)] bg-white px-2 text-xs font-medium"
                          >
                            Gelesen
                          </button>
                        ) : null}
                      </div>

                      <div className="max-h-[420px] overflow-y-auto">
                        {visibleNotifications.length > 0 ? (
                          visibleNotifications.map((notification) => (
                            <div
                              key={notification.id}
                              className="grid grid-cols-[1fr_auto] border-b border-[var(--line)] last:border-b-0"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSection(notification.section);
                                  setNotificationsOpen(false);
                                }}
                                className="grid gap-1 px-3 py-3 text-left hover:bg-[var(--surface-muted)]"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={[
                                      "size-2 shrink-0 rounded-full",
                                      getNotificationDotClass(notification.tone),
                                    ].join(" ")}
                                    aria-hidden="true"
                                  />
                                  <span className="text-sm font-semibold">
                                    {notification.title}
                                  </span>
                                </span>
                                <span className="text-xs leading-5 text-neutral-600">
                                  {notification.detail}
                                </span>
                              </button>
                              <button
                                type="button"
                                title="Benachrichtigung ausblenden"
                                onClick={() =>
                                  setDismissedNotificationIds((current) =>
                                    current.includes(notification.id)
                                      ? current
                                      : [...current, notification.id],
                                  )
                                }
                                className="flex w-10 items-start justify-center px-2 py-3 text-neutral-500 hover:text-[var(--danger)]"
                              >
                                <XCircle className="size-4" aria-hidden="true" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="grid gap-2 p-4 text-sm text-neutral-600">
                            <CheckCircle2
                              className="size-5 text-[var(--accent)]"
                              aria-hidden="true"
                            />
                            <span>Keine offenen Meldungen.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                {authStatus.signedIn ? (
                  <form action="/auth/sign-out" method="post">
                    <button
                      type="submit"
                      title="Abmelden"
                      className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white"
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      <span className="max-w-36 truncate">{userLabel}</span>
                    </button>
                  </form>
                ) : (
                  <a
                    href="/login"
                    className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white"
                  >
                    <UserCog className="size-4" aria-hidden="true" />
                    <span>Login</span>
                  </a>
                )}
              </div>
            </div>
          </header>

          <div className="grid gap-4 px-4 py-4 md:px-5">
            {setupNotice ? <Notice notice={setupNotice} /> : null}
            {workspaceData.warning ? (
              <Notice
                notice={{
                  tone: "warning",
                  text: `Datenhinweis: ${workspaceData.warning}`,
                }}
              />
            ) : null}
            {renderActiveSection()}
          </div>
        </section>
      </div>
      {patchNotesOpen ? (
        <PatchNotesLayer onClose={() => setPatchNotesOpen(false)} />
      ) : null}
      {workspaceData.lockdown.active ? (
        <LockdownOverlay lockdown={workspaceData.lockdown} />
      ) : null}
    </main>
  );

  function renderActiveSection() {
    switch (activeSection) {
      case "members":
        return (
          <MembersSection
            accessReason={accessReason}
            canViewSelectedMember={canViewSelectedMember}
            files={workspaceData.files}
            filteredMembers={filteredMembers}
            memberSearch={memberSearch}
            mfaReady={mfaReady}
            moderationEvents={workspaceData.moderationEvents}
            onCloseMemberCase={() => {
              setCaseDetailsSuppressed(true);
              setSelectedMemberId("");
              router.replace("/?section=members");
            }}
            onOpenMemberCase={(memberId) => {
              setCaseDetailsSuppressed(false);
              setSelectedMemberId(memberId);
            }}
            selectedMember={selectedMember}
            selectedMemberId={selectedMemberId}
            setAccessReason={setAccessReason}
            setMemberSearch={setMemberSearch}
            setSelectedMemberId={setSelectedMemberId}
            sync={workspaceData.sync}
          />
        );
      case "files":
        return (
          <FilesSection
            categories={workspaceData.categories}
            driveSync={workspaceData.driveSync}
            files={workspaceData.files}
            folders={workspaceData.folders}
            mfaReady={mfaReady}
            roles={workspaceData.roles}
          />
        );
      case "categories":
        return (
          <CategoriesSection
            categories={workspaceData.categories}
            mfaReady={mfaReady}
          />
        );
      case "users":
        return (
          <UsersSection
            authStatus={authStatus}
            mfaReady={mfaReady}
            roles={workspaceData.roles}
            users={workspaceData.users}
          />
        );
      case "roles":
        return (
          <RolesSection
            mfaReady={mfaReady}
            permissions={workspaceData.permissions}
            roles={workspaceData.roles}
          />
        );
      case "representation":
        return (
          <RepresentationSection
            absences={workspaceData.absences}
            discordRoles={workspaceData.discordRoles}
            members={members}
            mfaReady={mfaReady}
            ministryRoles={workspaceData.ministryRoles}
            representationEligibilities={workspaceData.representationEligibilities}
          />
        );
      case "activity":
        return <ActivitySection members={members} />;
      case "moderation":
        return (
          <ModerationSection
            members={members}
            mfaReady={mfaReady}
            moderationEvents={workspaceData.moderationEvents}
          />
        );
      case "advice":
        return (
          <ModerationAdviceSection
            adviceCases={workspaceData.moderationAdviceCases}
            environmentStatus={environmentStatus}
            members={members}
            mfaReady={mfaReady}
            selectedAdviceId={selectedAdviceId}
            setSelectedAdviceId={setSelectedAdviceCaseId}
          />
        );
      case "sync":
        return (
          <SyncSection
            discordInvites={workspaceData.discordInvites}
            mfaReady={mfaReady}
            sync={workspaceData.sync}
          />
        );
      case "settings":
        return (
          <SettingsSection
            authStatus={authStatus}
            environmentStatus={environmentStatus}
            lockdown={workspaceData.lockdown}
            members={members}
            mfaReady={mfaReady}
            previewKey={temporaryDesignPreviewKey}
            setPreviewKey={setTemporaryDesignPreviewKey}
            temporaryDesigns={workspaceData.temporaryDesigns}
          />
        );
      default:
        return (
          <DashboardSection
            logs={workspaceData.logs}
            members={members}
            metrics={dashboardMetrics}
            setActiveSection={setActiveSection}
            warning={dashboardSnapshot.warning}
          />
        );
    }
  }
}

function TemporaryDesignBanner({
  design,
  preview,
}: {
  design: ActiveTemporaryDesign;
  preview: boolean;
}) {
  if (!preview && (!design.theme.bannerEnabled || design.source === "default")) {
    return null;
  }

  const decorationClass = getTemporaryDesignDecorationClass(design.theme.decoration);
  const headerStyleClass = getTemporaryDesignHeaderStyleClass(design.theme.headerStyle);

  return (
    <div
      className={[
        "temporary-design-banner border-b border-[var(--line-strong)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white",
        `temporary-design-banner-${headerStyleClass}`,
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <span className="temporary-design-banner-copy">
          <span
            className={`temporary-design-emblem temporary-design-emblem-${decorationClass}`}
            aria-hidden="true"
          >
            <span className="temporary-design-emblem-mark" />
          </span>
          <span>
            {preview ? "Vorschau" : "Temporaeres Design"}:{" "}
            {design.theme.bannerLabel || design.name}
          </span>
        </span>
        <span className="font-mono text-xs uppercase opacity-85">
          {preview ? "nur lokal sichtbar" : design.source}
        </span>
      </div>
    </div>
  );
}

function TemporaryDesignAtmosphere({ design }: { design: ActiveTemporaryDesign }) {
  if (design.source === "default" || design.theme.backgroundClass === "theme-default") {
    return null;
  }

  const atmosphereElementCount = getTemporaryDesignAtmosphereElementCount(
    design.theme.backgroundClass,
  );

  return (
    <div className="temporary-design-atmosphere" aria-hidden="true">
      {Array.from({ length: atmosphereElementCount }, (_, index) => (
        <span key={`temporary-design-atmosphere-${index}`} />
      ))}
    </div>
  );
}

function getTemporaryDesignAtmosphereElementCount(
  backgroundClass?: string,
  mode: "live" | "preview" = "live",
) {
  if (!backgroundClass || backgroundClass === "theme-default") {
    return 0;
  }

  if (backgroundClass === "theme-wm-2026") {
    return mode === "preview" ? 12 : 18;
  }

  return mode === "preview" ? 10 : 16;
}

function DashboardSection({
  logs,
  members,
  metrics,
  setActiveSection,
  warning,
}: {
  logs: WorkspaceLogRow[];
  members: WorkspaceMember[];
  metrics: DashboardMetric[];
  setActiveSection: (section: SectionId) => void;
  warning?: string;
}) {
  return (
    <div className="grid gap-5">
      {warning ? (
        <div className="rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900">
          Datenmodus: Demo. {warning}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <article
              key={metric.label}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-neutral-500">{metric.label}</span>
                <Icon className="size-4 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <strong className="text-3xl font-semibold">{metric.value}</strong>
                <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent-strong)]">
                  {metric.change}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <SectionHeader
            icon={Shield}
            title="Mitgliederakten"
            action={
              <button
                type="button"
                onClick={() => setActiveSection("members")}
                className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white"
              >
                <Eye className="size-4" aria-hidden="true" />
                <span>Oeffnen</span>
              </button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-t border-[var(--line)] text-sm">
              <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Akte</th>
                  <th className="px-4 py-3 font-medium">Discord</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Aktivitaet</th>
                </tr>
              </thead>
              <tbody>
                {members.length > 0 ? (
                  members.slice(0, 5).map((member) => (
                    <tr key={member.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-3">
                        <div className="font-medium">{member.name}</div>
                        <div className="font-mono text-xs text-neutral-500">
                          {member.id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{member.discordName}</div>
                        <div className="font-mono text-xs text-neutral-500">
                          {member.discordId}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={member.status} />
                      </td>
                      <td className="px-4 py-3">{member.lastActivity}</td>
                    </tr>
                  ))
                ) : (
                  <TableEmpty colSpan={4} label="Noch keine Mitgliederakten angelegt." />
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <SectionHeader icon={Clock} title="Aktenprotokoll" />
          <div className="grid border-t border-[var(--line)]">
            {logs.length > 0 ? (
              logs.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-2 border-b border-[var(--line)] p-4 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{row.action}</p>
                      <p className="text-xs text-neutral-500">
                        {row.user} {"->"} {row.target}
                      </p>
                    </div>
                    {row.success ? (
                      <CheckCircle2
                        className="size-4 text-[var(--accent)]"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="size-4 text-[var(--danger)]"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1">
                      {row.reason}
                    </span>
                    <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1">
                      {row.time}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyPanel label="Noch kein Aktenprotokoll vorhanden." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MembersSection({
  accessReason,
  canViewSelectedMember,
  files,
  filteredMembers,
  memberSearch,
  mfaReady,
  moderationEvents,
  onCloseMemberCase,
  onOpenMemberCase,
  selectedMember,
  selectedMemberId,
  setAccessReason,
  setMemberSearch,
  setSelectedMemberId,
  sync,
}: {
  accessReason: string;
  canViewSelectedMember: boolean;
  files: WorkspaceFile[];
  filteredMembers: WorkspaceMember[];
  memberSearch: string;
  mfaReady: boolean;
  moderationEvents: WorkspaceModerationEvent[];
  onCloseMemberCase: () => void;
  onOpenMemberCase: (memberId: string) => void;
  selectedMember: WorkspaceMember | null;
  selectedMemberId: string;
  setAccessReason: (value: string) => void;
  setMemberSearch: (value: string) => void;
  setSelectedMemberId: (value: string) => void;
  sync: WorkspaceSyncStatus;
}) {
  const [openCaseMemberId, setOpenCaseMemberId] = useState("");
  const memberForOpenDialog =
    filteredMembers.find((member) => member.id === openCaseMemberId) ??
    (selectedMember?.id === openCaseMemberId ? selectedMember : null);
  const canConfirmCaseOpen = mfaReady && accessReason.trim().length >= 8;
  const selectedModerationEvents = useMemo(() => {
    if (!selectedMember) {
      return [];
    }

    return moderationEvents.filter((event) => {
      const matchesMember = event.memberId && event.memberId === selectedMember.id;
      const matchesDiscord =
        selectedMember.discordId !== "-" && event.discordId === selectedMember.discordId;

      return matchesMember || matchesDiscord;
    });
  }, [moderationEvents, selectedMember]);
  const selectedProfileImageFile = selectedMember
    ? getMemberProfileImageFile(selectedMember)
    : null;

  return (
    <div className="grid gap-4">
      {!canViewSelectedMember ? (
      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader
          icon={Shield}
          title="Mitgliederkartei"
          action={
            <span className="border border-[var(--line)] bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent-strong)]">
              {mfaReady ? "2FA aktiv" : "2FA offen"}
            </span>
          }
        />

        <div className="grid gap-3 border-t border-[var(--line-strong)] p-3">
          <dl className="grid gap-2 border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
            <DetailRow
              label="Discord Server"
              value={
                sync.memberServerEstimate !== null
                  ? `ca. ${formatNumber(sync.memberServerEstimate)}`
                  : "-"
              }
            />
            <DetailRow
              label="Erfasst"
              value={formatNumber(sync.memberScanned)}
            />
            <DetailRow
              label="Offen"
              value={
                sync.memberMissingEstimate !== null
                  ? formatNumber(sync.memberMissingEstimate)
                  : "-"
              }
            />
            <DetailRow
              label="Akten"
              value={formatNumber(sync.memberUpserted)}
            />
            <DetailRow
              label="Bots"
              value={formatNumber(sync.memberSkippedBots)}
            />
            <DetailRow
              label="Status"
              value={
                sync.memberCoverageComplete
                  ? "Vollstaendig"
                  : sync.memberPageLimitHit
                    ? "Limit"
                    : "Pruefen"
              }
            />
          </dl>

          {!sync.memberCoverageComplete ? (
            <div className="border border-[var(--warning)] bg-[#fff4d6] p-3 text-sm text-amber-950">
              Discord meldet mehr Mitglieder als der Sync erfasst hat. Pruefe den
              Server-Members-Intent beim Bot oder starte den Bot-Gateway-Sync.
            </div>
          ) : null}

          <details className="border border-[var(--line)] bg-[var(--surface-muted)]">
            <summary className="flex cursor-pointer items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2 text-sm font-bold uppercase">
              <span>Manuelle Akte anlegen</span>
              <Plus className="size-4" aria-hidden="true" />
            </summary>
          <form action={createMemberAction} className="grid gap-3 p-3">
            {!mfaReady ? (
              <div className="flex flex-col gap-3 border border-amber-300 bg-[#fff4d6] p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Mitgliederakten koennen erst mit aktiver 2FA-Sitzung angelegt werden.
                </span>
                <a
                  href="/security?setup=member-create-aal2"
                  className="flex h-9 w-fit items-center gap-2 border border-[var(--line-strong)] bg-[var(--foreground)] px-3 text-sm text-white"
                >
                  <KeyRound className="size-4" aria-hidden="true" />
                  <span>2FA freischalten</span>
                </a>
              </div>
            ) : null}

            <fieldset disabled={!mfaReady} className="grid gap-3 disabled:opacity-60">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Name
                </span>
                <input
                  name="name"
                  required
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Zugriffsgrund
                </span>
                <input
                  name="reason"
                  required
                  minLength={8}
                  placeholder="z.B. Erstaufnahme"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Discord-ID
                </span>
                <input
                  name="discordId"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Anzeigename
                </span>
                <input
                  name="discordDisplayName"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              </div>

              <details className="grid gap-3">
              <summary className="cursor-pointer text-sm font-medium text-neutral-700">
                Weitere Felder
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Alter
                  </span>
                  <input
                    name="age"
                    type="number"
                    min={0}
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Wohnort
                  </span>
                  <input
                    name="residence"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Berufsfeld
                  </span>
                  <input
                    name="profession"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Telefon
                  </span>
                  <input
                    name="phone"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Discord-Benutzername
                  </span>
                  <input
                    name="discordUsername"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Instagram
                  </span>
                  <input
                    name="instagram"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Snapchat
                  </span>
                  <input
                    name="snapchat"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    TikTok
                  </span>
                  <input
                    name="tiktok"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Stream
                  </span>
                  <input
                    name="stream"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Ubisoft
                  </span>
                  <input
                    name="ubisoft"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    EA
                  </span>
                  <input
                    name="ea"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Notizen
                  </span>
                  <input
                    name="notes"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>
              </details>

              <div>
              <button
                type="submit"
                disabled={!mfaReady}
                className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Shield className="size-4" aria-hidden="true" />
                <span>Akte anlegen</span>
              </button>
              </div>
            </fieldset>
          </form>
          </details>

          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Suche
              </span>
              <div className="flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3">
                <Search className="size-4 text-neutral-500" aria-hidden="true" />
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Name, Discord-ID oder Akten-ID"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Mitglied</th>
                  <th className="px-4 py-3 font-medium">Discord</th>
                  <th className="px-4 py-3 font-medium">Rollen</th>
                  <th className="px-4 py-3 font-medium">Monat</th>
                  <th className="px-4 py-3 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((member) => (
                  <tr
                    key={member.id}
                    onClick={() => setSelectedMemberId(member.id)}
                    aria-selected={selectedMemberId === member.id}
                    className={[
                      "cursor-pointer border-t border-[var(--line)] transition hover:bg-[var(--surface-muted)]",
                      selectedMemberId === member.id
                        ? "bg-[var(--accent-soft)]"
                        : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{member.name}</div>
                      <div className="font-mono text-xs text-neutral-500">
                        {member.id} {"-"} {member.residence}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{member.displayName}</div>
                      <div className="font-mono text-xs text-neutral-500">
                        {member.discordId}
                      </div>
                      <span
                        className={[
                          "mt-1 inline-flex rounded-md px-2 py-1 text-xs font-medium",
                          member.discordOnServer
                            ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                            : "bg-red-50 text-[var(--danger)]",
                        ].join(" ")}
                      >
                        {member.discordOnServer ? "Auf Server" : "Nicht auf Server"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {member.roles.slice(0, 2).map((role) => (
                          <span
                            key={role}
                            className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs"
                          >
                            {role}
                          </span>
                        ))}
                        {member.roles.length === 0 ? (
                          <span className="text-xs text-neutral-500">Keine Rollen</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {member.discordAnalyticsEnabled ? (
                        <>
                          <div>{member.messagesMonth} Nachrichten</div>
                          <div className="text-xs text-neutral-500">
                            {member.voiceHoursMonth} Voice-Stunden
                          </div>
                        </>
                      ) : (
                        <span className="rounded-md bg-[#fff4d6] px-2 py-1 text-xs font-medium text-[var(--warning)]">
                          Auswertung aus
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedMemberId(member.id);
                          }}
                          title="Akte auswaehlen"
                          className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          <span>Auswaehlen</span>
                        </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setAccessReason("");
                              setSelectedMemberId(member.id);
                              setOpenCaseMemberId(member.id);
                            }}
                            title="Akte oeffnen"
                            className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm"
                          >
                            <Eye className="size-4" aria-hidden="true" />
                            <span>Oeffnen</span>
                          </button>
                      </div>
                    </td>
                  </tr>
                  ))
                ) : (
                  <TableEmpty colSpan={5} label="Noch keine passende Mitgliederakte." />
                )}
              </tbody>
            </table>
          </div>
        </div>

        {memberForOpenDialog ? (
          <div
            aria-modal="true"
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4 py-6"
            role="dialog"
          >
            <div className="w-full max-w-lg border border-[var(--line-strong)] bg-[var(--surface)] shadow-[8px_8px_0_rgba(0,0,0,0.24)]">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--line-strong)] bg-[var(--surface-muted)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold uppercase">Akte oeffnen</p>
                  <p className="truncate text-xs text-neutral-600">
                    {memberForOpenDialog.name}
                  </p>
                </div>
                <button
                  type="button"
                  title="Abbrechen"
                  onClick={() => setOpenCaseMemberId("")}
                  className="flex size-8 items-center justify-center border border-[var(--line)] bg-white text-neutral-700"
                >
                  <XCircle className="size-4" aria-hidden="true" />
                </button>
              </div>
              <form
                action={openMemberCaseAction}
                className="grid gap-3 p-4"
                onSubmit={() => {
                  onOpenMemberCase(memberForOpenDialog.id);
                  setOpenCaseMemberId("");
                }}
              >
                <input
                  type="hidden"
                  name="memberId"
                  value={memberForOpenDialog.id}
                />
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Zugriffsgrund
                  </span>
                  <input
                    name="reason"
                    value={accessReason}
                    onChange={(event) => setAccessReason(event.target.value)}
                    minLength={8}
                    required
                    autoFocus
                    placeholder="z.B. Moderationsfall pruefen"
                    className="h-10 border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                {!mfaReady ? (
                  <div className="border border-amber-300 bg-[#fff4d6] p-3 text-sm text-amber-950">
                    2FA muss aktiv sein, bevor die Akte geoeffnet werden kann.
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenCaseMemberId("")}
                    className="flex h-10 items-center justify-center gap-2 border border-[var(--line)] bg-white px-4 text-sm"
                  >
                    <XCircle className="size-4" aria-hidden="true" />
                    <span>Abbrechen</span>
                  </button>
                  <button
                    type="submit"
                    disabled={!canConfirmCaseOpen}
                    className="flex h-10 items-center justify-center gap-2 bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    <span>Bestaetigen</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {canViewSelectedMember ? (
      <aside className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader
          icon={Lock}
          title="Aktendetail"
          action={
            <button
              type="button"
              onClick={onCloseMemberCase}
              className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm"
            >
              <Users className="size-4" aria-hidden="true" />
              <span>Zur Kartei</span>
            </button>
          }
        />
        <div className="grid gap-4 border-t border-[var(--line-strong)] p-3">
          {!selectedMember ? (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-neutral-600">
              Waehle eine Mitgliederakte aus, sobald Daten vorhanden sind.
            </div>
          ) : !canViewSelectedMember ? (
            <div className="grid gap-4">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{selectedMember.name}</p>
                    <p className="font-mono text-xs text-neutral-500">
                      {selectedMember.id}
                    </p>
                  </div>
                  <StatusBadge status={selectedMember.status} />
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <DetailRow
                    label="Discord-Benutzername"
                    value={selectedMember.discordName}
                  />
                  <DetailRow
                    label="Discord-Anzeigename"
                    value={selectedMember.displayName}
                  />
                  <DetailRow
                    label="Server"
                    value={selectedMember.discordOnServer ? "Auf Server" : "Nicht auf Server"}
                  />
                  <DetailRow label="Letzter Sync" value={selectedMember.discordLastSeenAt} />
                </dl>
              </div>

              <form
                action={openMemberCaseAction}
                className="grid gap-3 rounded-lg border border-[var(--line)] p-4"
              >
                <input type="hidden" name="memberId" value={selectedMember.id} />
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Zugriffsgrund
                  </span>
                  <input
                    name="reason"
                    value={accessReason}
                    onChange={(event) => setAccessReason(event.target.value)}
                    minLength={8}
                    required
                    placeholder="z.B. Moderationsfall pruefen"
                  className="h-9 border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                {!mfaReady ? (
                  <div className="rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900">
                    2FA muss aktiv sein, bevor die Detailansicht freigeschaltet wird.
                  </div>
                ) : null}
                <button
                  type="submit"
                  onClick={() => onOpenMemberCase(selectedMember.id)}
                  disabled={!canConfirmCaseOpen}
                  className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Eye className="size-4" aria-hidden="true" />
                  <span>Akte oeffnen</span>
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <div className="grid gap-3 sm:grid-cols-[8.5rem_1fr]">
                  <MemberProfileImage
                    member={selectedMember}
                    profileImageFile={selectedProfileImageFile}
                  />
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{selectedMember.name}</p>
                        <p className="font-mono text-xs text-neutral-500">
                          {selectedMember.id}
                        </p>
                      </div>
                      <StatusBadge status={selectedMember.status} />
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm">
                      <DetailRow label="Alter" value={formatNullable(selectedMember.age)} />
                      <DetailRow label="Wohnort" value={selectedMember.residence} />
                      <DetailRow label="Berufsfeld" value={selectedMember.profession} />
                      <DetailRow
                        label="Discord-Benutzername"
                        value={selectedMember.discordName}
                      />
                      <DetailRow
                        label="Discord-Anzeigename"
                        value={selectedMember.displayName}
                      />
                      <DetailRow
                        label="Server"
                        value={selectedMember.discordOnServer ? "Auf Server" : "Nicht auf Server"}
                      />
                      <DetailRow
                        label="Beigetreten"
                        value={selectedMember.discordJoinedAt}
                      />
                      <DetailRow label="Eingeladen von" value={selectedMember.invitedBy} />
                    </dl>
                  </div>
                </div>
                <MemberIntakePanel intake={selectedMember.intake} />
                <form
                  action={uploadMemberProfileImageAction}
                  className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3 lg:grid-cols-[1fr_1fr_auto]"
                  encType="multipart/form-data"
                >
                  <input type="hidden" name="memberId" value={selectedMember.id} />
                  <label className="grid gap-1">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Profilbild
                    </span>
                    <input
                      name="profileImage"
                      type="file"
                      accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
                      required
                      disabled={!mfaReady}
                      className="h-9 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-muted)] file:px-2 file:py-1 file:text-xs file:font-medium disabled:cursor-not-allowed disabled:opacity-45"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Grund
                    </span>
                    <input
                      name="reason"
                      required
                      minLength={8}
                      placeholder="z.B. Profilbild aktualisiert"
                      className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={!mfaReady}
                      className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Upload className="size-4" aria-hidden="true" />
                      <span>Bild setzen</span>
                    </button>
                  </div>
                </form>
              </div>

              <details className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Akte bearbeiten
                </summary>
                <form action={updateMemberCaseAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="memberId" value={selectedMember.id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Name
                      </span>
                      <input
                        name="name"
                        defaultValue={selectedMember.name}
                        required
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Status
                      </span>
                      <select
                        name="status"
                        defaultValue={selectedMember.statusKey}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      >
                        <option value="active">Aktiv</option>
                        <option value="review">Pruefung</option>
                        <option value="archived">Archiv</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Alter
                      </span>
                      <input
                        name="age"
                        type="number"
                        min={0}
                        defaultValue={selectedMember.age ?? ""}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Telefon
                      </span>
                      <input
                        name="phone"
                        defaultValue={selectedMember.phone}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Wohnort
                      </span>
                      <input
                        name="residence"
                        defaultValue={selectedMember.residence === "-" ? "" : selectedMember.residence}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Berufsfeld
                      </span>
                      <input
                        name="profession"
                        defaultValue={selectedMember.profession === "-" ? "" : selectedMember.profession}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Discord-ID
                      </span>
                      <input
                        name="discordId"
                        defaultValue={selectedMember.discordId === "-" ? "" : selectedMember.discordId}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Discord-Benutzername
                      </span>
                      <input
                        name="discordUsername"
                        defaultValue={selectedMember.discordName === "-" ? "" : selectedMember.discordName}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Anzeigename
                      </span>
                      <input
                        name="discordDisplayName"
                        defaultValue={selectedMember.displayName === "-" ? "" : selectedMember.displayName}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Instagram
                      </span>
                      <input
                        name="instagram"
                        defaultValue={selectedMember.instagram}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Snapchat
                      </span>
                      <input
                        name="snapchat"
                        defaultValue={selectedMember.snapchat}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        TikTok
                      </span>
                      <input
                        name="tiktok"
                        defaultValue={selectedMember.tiktok}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Stream
                      </span>
                      <input
                        name="stream"
                        defaultValue={selectedMember.stream}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Ubisoft
                      </span>
                      <input
                        name="ubisoft"
                        defaultValue={selectedMember.ubisoft}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        EA
                      </span>
                      <input
                        name="ea"
                        defaultValue={selectedMember.ea}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Notizen
                    </span>
                    <textarea
                      name="notes"
                      defaultValue={selectedMember.notes}
                      rows={3}
                      className="rounded-md border border-[var(--line)] bg-white px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Grund
                      </span>
                      <input
                        name="reason"
                        required
                        minLength={8}
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={!mfaReady}
                        className="flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Save className="size-4" aria-hidden="true" />
                        <span>Speichern</span>
                      </button>
                    </div>
                  </div>
                </form>
              </details>

              <details className="rounded-lg border border-red-200 bg-[#fff4d6] p-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--danger)]">
                  Akte loeschen
                </summary>
                <form action={deleteMemberCaseAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="memberId" value={selectedMember.id} />
                  <p className="text-xs text-neutral-700">
                    Loeschen entfernt die Mitgliederakte und ihre direkten Verknuepfungen.
                    Der Vorgang wird im Aktenprotokoll festgehalten.
                  </p>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium uppercase text-neutral-600">
                      Grund
                    </span>
                    <input
                      name="reason"
                      required
                      minLength={8}
                      placeholder="z.B. doppelte Akte"
                      className="h-9 rounded-md border border-red-200 bg-white px-2 text-sm outline-none focus:border-[var(--danger)]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!mfaReady}
                    className="flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--danger)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span>Akte loeschen</span>
                  </button>
                </form>
              </details>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Discord-Datenschutz</h3>
                    <p className="mt-1 text-xs text-neutral-600">
                      {selectedMember.discordAnalyticsEnabled
                        ? "Auswertung durch den Bot ist erlaubt."
                        : "Auswertung durch den Bot ist deaktiviert."}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                      selectedMember.discordAnalyticsEnabled
                        ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        : "bg-[#fff4d6] text-[var(--warning)]",
                    ].join(" ")}
                  >
                    {selectedMember.discordAnalyticsEnabled ? "Aktiv" : "Aus"}
                  </span>
                </div>
                {!selectedMember.discordAnalyticsEnabled ? (
                  <dl className="mt-3 grid gap-2 text-xs text-neutral-600">
                    <DetailRow
                      label="Deaktiviert seit"
                      value={selectedMember.discordAnalyticsDisabledAt}
                    />
                    <DetailRow
                      label="Grund"
                      value={selectedMember.discordAnalyticsDisabledReason || "-"}
                    />
                  </dl>
                ) : null}
                <form
                  action={setMemberDiscordAnalyticsAction}
                  className="mt-3 grid gap-2"
                >
                  <input type="hidden" name="memberId" value={selectedMember.id} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={selectedMember.discordAnalyticsEnabled ? "false" : "true"}
                  />
                  <input
                    name="reason"
                    required
                    minLength={8}
                    placeholder={
                      selectedMember.discordAnalyticsEnabled
                        ? "Grund fuer Deaktivierung"
                        : "Grund fuer Aktivierung"
                    }
                    className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="submit"
                    title={
                      selectedMember.discordAnalyticsEnabled
                        ? "Discord-Auswertung deaktivieren"
                        : "Discord-Auswertung aktivieren"
                    }
                    className={[
                      "flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm text-white",
                      selectedMember.discordAnalyticsEnabled
                        ? "bg-[var(--danger)]"
                        : "bg-[var(--foreground)]",
                    ].join(" ")}
                  >
                    <Shield className="size-4" aria-hidden="true" />
                    <span>
                      {selectedMember.discordAnalyticsEnabled
                        ? "Auswertung deaktivieren"
                        : "Auswertung aktivieren"}
                    </span>
                  </button>
                </form>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Strafen & Warns</h3>
                  <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs font-medium text-neutral-600">
                    {formatNumber(selectedModerationEvents.length)}
                  </span>
                </div>
                <div className="grid gap-2">
                  {selectedModerationEvents.length > 0 ? (
                    selectedModerationEvents.map((event) => (
                      <details
                        key={event.id}
                        className="border border-[var(--line)] bg-[var(--surface-muted)]"
                      >
                        <summary className="grid cursor-pointer gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  "rounded-md px-2 py-1 text-xs font-medium",
                                  getModerationTypeClass(event.eventType),
                                ].join(" ")}
                              >
                                {event.eventTypeLabel}
                              </span>
                              <span
                                className={[
                                  "rounded-md px-2 py-1 text-xs font-medium",
                                  getModerationStatusClass(event.status),
                                ].join(" ")}
                              >
                                {event.statusLabel}
                              </span>
                              {event.lifetime ? (
                                <span className="rounded-md bg-[#e8eef2] px-2 py-1 text-xs font-medium text-neutral-700">
                                  Lifetime
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 truncate text-sm font-medium">
                              {event.reason}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                              {event.startedAt} {"-"} {event.moderator}
                            </p>
                            {event.commandError ? (
                              <p className="mt-1 truncate text-xs text-[var(--danger)]">
                                Bot/DM: {event.commandError}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-left text-xs text-neutral-600 sm:text-right">
                            <div>{event.totalDuration}</div>
                            <div>Rest: {event.remainingDuration}</div>
                          </div>
                        </summary>
                        <div className="grid gap-3 border-t border-[var(--line)] p-3">
                          <form
                            action={updateModerationEventAction}
                            className="grid gap-2"
                          >
                            <input type="hidden" name="eventId" value={event.id} />
                            <input
                              type="hidden"
                              name="memberId"
                              value={selectedMember.id}
                            />
                            <div className="grid gap-2 sm:grid-cols-3">
                              <label className="grid gap-1">
                                <span className="text-xs font-medium uppercase text-neutral-500">
                                  Art
                                </span>
                                <select
                                  name="eventType"
                                  defaultValue={event.eventType}
                                  className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                                >
                                  <option value="warn">Warn</option>
                                  <option value="timeout">Timeout</option>
                                  <option value="kick">Kick</option>
                                  <option value="voice_disconnect">Disconnect</option>
                                  <option value="ban">Ban</option>
                                </select>
                              </label>
                              <label className="grid gap-1">
                                <span className="text-xs font-medium uppercase text-neutral-500">
                                  Status
                                </span>
                                <select
                                  name="status"
                                  defaultValue={getEditableModerationStatus(
                                    event.status,
                                  )}
                                  className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                                >
                                  <option value="active">Aktiv</option>
                                  <option value="recorded">Erfasst</option>
                                  <option value="expired">Abgelaufen</option>
                                  <option value="lifted">Aufgehoben</option>
                                  <option value="failed">Fehlgeschlagen</option>
                                </select>
                              </label>
                              <label className="grid gap-1">
                                <span className="text-xs font-medium uppercase text-neutral-500">
                                  Minuten
                                </span>
                                <input
                                  name="durationMinutes"
                                  type="number"
                                  min={1}
                                  defaultValue={
                                    event.durationSeconds
                                      ? Math.round(event.durationSeconds / 60)
                                      : ""
                                  }
                                  placeholder="nur Timeout"
                                  className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                                />
                              </label>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                              <label className="grid gap-1">
                                <span className="text-xs font-medium uppercase text-neutral-500">
                                  Grund
                                </span>
                                <input
                                  name="reason"
                                  required
                                  minLength={8}
                                  defaultValue={event.reason === "-" ? "" : event.reason}
                                  className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                                />
                              </label>
                              <div className="flex items-end">
                                <button
                                  type="submit"
                                  title="Strafe anpassen"
                                  className="flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white"
                                >
                                  <Save className="size-4" aria-hidden="true" />
                                  <span>Anpassen</span>
                                </button>
                              </div>
                            </div>
                          </form>
                          <form
                            action={deleteModerationEventAction}
                            className="grid gap-2 border-t border-[var(--line)] pt-3 sm:grid-cols-[1fr_auto]"
                          >
                            <input type="hidden" name="eventId" value={event.id} />
                            <input
                              type="hidden"
                              name="memberId"
                              value={selectedMember.id}
                            />
                            <input
                              name="reason"
                              required
                              minLength={8}
                              placeholder="Grund fuer Loeschung"
                              className="h-9 rounded-md border border-red-200 bg-white px-2 text-sm outline-none focus:border-[var(--danger)]"
                            />
                            <button
                              type="submit"
                              title="Strafe loeschen"
                              className="flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm text-[var(--danger)]"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                              <span>Loeschen</span>
                            </button>
                          </form>
                        </div>
                      </details>
                    ))
                  ) : (
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-neutral-600">
                      Keine Strafen oder Warns fuer diese Akte.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Discord-Rollen</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedMember.roles.length > 0 ? (
                    selectedMember.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs"
                      >
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-neutral-500">
                      Keine Rollen synchronisiert.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Dateiverknuepfungen</h3>
                <div className="grid gap-2">
                  {selectedMember.linkedFiles.length > 0 ? (
                    selectedMember.linkedFiles.map((file) => (
                      <div
                        key={file.fileId}
                        className="grid gap-2 border-b border-[var(--line)] py-2 text-sm last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{file.name}</p>
                            <p className="truncate text-xs text-neutral-500">
                              {file.sizeLabel} {"-"} {file.relationType}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <a
                              href={`/files/open?fileId=${encodeURIComponent(
                                file.fileId,
                              )}&memberId=${encodeURIComponent(selectedMember.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Datei direkt oeffnen"
                              className="flex size-8 items-center justify-center rounded-md border border-[var(--line)] bg-white"
                            >
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                            <form action={downloadFileAction}>
                              <input
                                type="hidden"
                                name="fileId"
                                value={file.fileId}
                              />
                              <button
                                type="submit"
                                title="Datei herunterladen"
                                className="flex size-8 items-center justify-center rounded-md border border-[var(--line)] bg-white"
                              >
                                <Download className="size-4" aria-hidden="true" />
                              </button>
                            </form>
                          </div>
                        </div>
                        <form
                          action={unlinkMemberFileAction}
                          className="grid gap-2 sm:grid-cols-[1fr_auto]"
                        >
                          <input type="hidden" name="memberId" value={selectedMember.id} />
                          <input type="hidden" name="fileId" value={file.fileId} />
                          <input
                            name="reason"
                            required
                            minLength={8}
                            placeholder="Grund fuer Entfernen"
                            className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                          />
                          <button
                            type="submit"
                            title="Verknuepfung entfernen"
                            className="flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm text-[var(--danger)]"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            <span>Loesen</span>
                          </button>
                        </form>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-neutral-600">
                      Noch keine Dateien verknuepft.
                    </div>
                  )}
                </div>
                <form
                  action={linkMemberFileAction}
                  className="mt-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3"
                >
                  <input type="hidden" name="memberId" value={selectedMember.id} />
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Datei verknuepfen
                    </span>
                    <select
                      name="fileId"
                      required
                      defaultValue=""
                      disabled={files.length === 0}
                      className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <option value="">Datei waehlen</option>
                      {files.map((file) => (
                        <option
                          key={file.id}
                          value={file.id}
                          disabled={selectedMember.linkedFiles.some(
                            (linkedFile) => linkedFile.fileId === file.id,
                          )}
                        >
                          {file.originalName} ({file.category})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Art
                      </span>
                      <select
                        name="relationType"
                        defaultValue="linked"
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      >
                        <option value="linked">Verknuepfung</option>
                        <option value="evidence">Nachweis</option>
                        <option value="note">Notiz</option>
                        <option value="avatar">Profilbild</option>
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Grund
                      </span>
                      <input
                        name="reason"
                        required
                        minLength={8}
                        placeholder="z.B. Nachweis hinterlegen"
                        className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    title="Datei verknuepfen"
                    disabled={files.length === 0}
                    className="flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    <span>Verknuepfen</span>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </aside>
      ) : null}
    </div>
  );
}

function FilesSection({
  categories,
  driveSync,
  files,
  folders,
  mfaReady,
  roles,
}: {
  categories: WorkspaceCategory[];
  driveSync: WorkspaceDriveSync;
  files: WorkspaceFile[];
  folders: WorkspaceFolder[];
  mfaReady: boolean;
  roles: WorkspaceRoleRow[];
}) {
  const roleOptions = roles.filter((role) => role.id && role.role);
  const [fileSearch, setFileSearch] = useState("");
  const [fileCategoryFilter, setFileCategoryFilter] = useState("all");
  const filteredFiles = useMemo(() => {
    const query = fileSearch.trim().toLowerCase();

    return files.filter((file) => {
      const matchesCategory =
        fileCategoryFilter === "all" || file.categoryId === fileCategoryFilter;
      const matchesQuery =
        !query ||
        [
          file.originalName,
          file.description,
          file.category,
          file.folder,
          file.type,
          file.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesCategory && matchesQuery;
    });
  }, [fileCategoryFilter, fileSearch, files]);
  const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 border border-[var(--line-strong)] bg-[var(--surface)] p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="size-5 text-[var(--accent)]" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-semibold">Datei-Datenbank</h2>
            <p className="truncate text-sm text-neutral-500">
              Dateien bleiben zentral gespeichert, Akten speichern nur Verknuepfungen.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={runDriveManualSyncAction}>
            <button
              type="submit"
              title="Mit Google Drive synchronisieren"
              disabled={!mfaReady}
              className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              <span>Drive-Sync</span>
            </button>
          </form>
          <a
            href="#google-doc-create"
            title="Neues Google Docs Dokument aus Vorlage"
            className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm"
          >
            <FileText className="size-4" aria-hidden="true" />
            <span>Neues Docs</span>
          </a>
          <a
            href="#file-upload"
            title="Datei hochladen"
            className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm"
          >
            <Upload className="size-4" aria-hidden="true" />
            <span>Hochladen</span>
          </a>
          <a
            href="#folder-upload"
            title="Ordner hochladen"
            className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm"
          >
            <Folder className="size-4" aria-hidden="true" />
            <span>Ordner-Upload</span>
          </a>
          <a
            href="#folder-create"
            title="Ordner anlegen"
            className="flex h-9 items-center gap-2 border border-[var(--line-strong)] bg-[var(--foreground)] px-3 text-sm text-white"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Ordner</span>
          </a>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <DetailBox label="Dateien" value={formatNumber(files.length)} />
        <DetailBox label="Ordner" value={formatNumber(folders.length)} />
        <DetailBox label="Kategorien" value={formatNumber(categories.length)} />
        <DetailBox label="Speicher" value={formatFileSize(totalFileSize)} />
        <DetailBox
          label="Drive"
          value={driveSync.configured ? driveSync.latestStatus : "Config fehlt"}
          detail={`${driveSync.latestRunAt} | Konflikte ${formatNumber(
            driveSync.conflictCount,
          )}`}
        />
      </div>

      {driveSync.conflictCount > 0 ? (
        <section className="border border-amber-300 bg-[#fff4d6] p-3 text-sm text-amber-950">
          <div className="mb-2 flex items-center gap-2 font-bold uppercase">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <span>Drive-Konflikte offen</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {driveSync.conflicts.slice(0, 6).map((conflict) => (
              <div key={conflict.id} className="border border-amber-300 bg-white p-2">
                <div className="text-xs font-bold">
                  {formatDriveConflictType(conflict.conflictType)}
                </div>
                <div className="font-mono text-[11px] text-neutral-500">
                  {conflict.conflictType}
                </div>
                <div className="text-xs text-neutral-600">
                  {conflict.entityType} | {conflict.createdAt}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details
        id="file-upload"
        className="border border-[var(--line-strong)] bg-[var(--surface)]"
      >
        <summary className="flex cursor-pointer items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-sm font-bold uppercase">
          <Upload className="size-4" aria-hidden="true" />
          <span>Datei hochladen</span>
        </summary>
        <form
          action={uploadFileAction}
          encType="multipart/form-data"
          className="grid gap-3 border-t border-[var(--line)] p-4 xl:grid-cols-[1.25fr_1fr_1fr] 2xl:grid-cols-[1.25fr_1fr_1fr_1fr_1fr_auto]"
        >
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Datei
            </span>
            <input
              type="file"
              name="files"
              multiple
              required
              disabled={!mfaReady}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-muted)] file:px-3 file:py-1 file:text-xs file:font-medium disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Kategorie
            </span>
            <select
              name="categoryId"
              required
              disabled={!mfaReady || categories.length === 0}
              defaultValue=""
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="">Kategorie waehlen</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Ordner
            </span>
            <select
              name="folderId"
              disabled={!mfaReady || folders.length === 0}
              defaultValue=""
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="">Ohne Ordner</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.category} / {folder.folder}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Beschreibung
            </span>
            <input
              name="description"
              disabled={!mfaReady}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Tags
            </span>
            <input
              name="tags"
              disabled={!mfaReady}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              title="Datei hochladen"
              disabled={!mfaReady || categories.length === 0}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 2xl:w-auto"
            >
              <Upload className="size-4" aria-hidden="true" />
              <span>Speichern</span>
            </button>
          </div>
        </form>
        {!mfaReady ? (
          <div className="border-t border-[var(--line)] px-4 py-3">
            <div className="rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900">
              2FA-Sitzung freischalten, bevor Dateien hochgeladen werden.
            </div>
          </div>
        ) : null}
      </details>

      <details
        id="folder-upload"
        className="border border-[var(--line-strong)] bg-[var(--surface)]"
      >
        <summary className="flex cursor-pointer items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-sm font-bold uppercase">
          <Upload className="size-4" aria-hidden="true" />
          <span>Ordner hochladen</span>
        </summary>
        <form
          action={uploadFileAction}
          encType="multipart/form-data"
          className="grid gap-3 border-t border-[var(--line)] p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Ordner
            </span>
            <input
              type="file"
              name="files"
              multiple
              {...({ webkitdirectory: "true" } as Record<string, string>)}
              disabled={!mfaReady}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-muted)] file:px-3 file:py-1 file:text-xs file:font-medium disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Kategorie
            </span>
            <select
              name="categoryId"
              required
              disabled={!mfaReady || categories.length === 0}
              defaultValue=""
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="">Kategorie waehlen</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Zielordner
            </span>
            <select
              name="folderId"
              disabled={!mfaReady || folders.length === 0}
              defaultValue=""
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="">Ohne Ordner</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.category} / {folder.folder}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!mfaReady || categories.length === 0}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 lg:w-auto"
            >
              <Upload className="size-4" aria-hidden="true" />
              <span>Ordner speichern</span>
            </button>
          </div>
        </form>
      </details>

      <details
        id="google-doc-create"
        className="border border-[var(--line-strong)] bg-[var(--surface)]"
      >
        <summary className="flex cursor-pointer items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-sm font-bold uppercase">
          <FileText className="size-4" aria-hidden="true" />
          <span>Neues Docs-Dokument</span>
        </summary>
        <form
          action={createGoogleDocAction}
          className="grid gap-3 border-t border-[var(--line)] p-4 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        >
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Dokumentname
            </span>
            <input
              name="documentName"
              required
              minLength={2}
              disabled={!mfaReady}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Zielordner
            </span>
            <select
              name="folderId"
              required
              disabled={!mfaReady || folders.length === 0}
              defaultValue=""
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="">Ordner waehlen</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.category} / {folder.folder}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Beschreibung
            </span>
            <input
              name="description"
              disabled={!mfaReady}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Tags
            </span>
            <input
              name="tags"
              defaultValue="google-docs, vorlage"
              disabled={!mfaReady}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!mfaReady || folders.length === 0}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 lg:w-auto"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>Erstellen</span>
            </button>
          </div>
        </form>
      </details>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader
          icon={FileText}
          title="Gespeicherte Dateien"
          action={
            <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs font-medium text-neutral-600">
              {formatNumber(filteredFiles.length)} / {formatNumber(files.length)}
            </span>
          }
        />
        <div className="grid gap-3 border-t border-[var(--line)] p-3 lg:grid-cols-[1fr_260px]">
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Suche
            </span>
            <div className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-2">
              <Search className="size-4 text-neutral-500" aria-hidden="true" />
              <input
                value={fileSearch}
                onChange={(event) => setFileSearch(event.target.value)}
                placeholder="Datei, Ordner, Tag, Typ"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Kategorie
            </span>
            <select
              value={fileCategoryFilter}
              onChange={(event) => setFileCategoryFilter(event.target.value)}
              className="h-9 border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="all">Alle Kategorien</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[1440px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Datei</th>
                <th className="px-4 py-3 font-medium">Ablage</th>
                <th className="px-4 py-3 font-medium">Typ</th>
                <th className="px-4 py-3 font-medium">Sync</th>
                <th className="px-4 py-3 font-medium">Upload</th>
                <th className="px-4 py-3 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.length > 0 ? (
                filteredFiles.map((file) => (
                  <tr key={file.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{file.originalName}</div>
                      {file.description ? (
                        <div className="max-w-md truncate text-xs text-neutral-500">
                          {file.description}
                        </div>
                      ) : null}
                      {file.tags.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {file.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-neutral-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div>{file.category}</div>
                      <div className="text-xs text-neutral-500">{file.folder}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{file.type}</div>
                      <div className="text-xs text-neutral-500">{file.sizeLabel}</div>
                      {file.source === "google_drive" ? (
                        <div className="mt-1 inline-flex border border-[var(--line)] bg-white px-1.5 py-0.5 text-xs text-neutral-600">
                          Google Drive
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className={[
                          "inline-flex border px-2 py-1 text-xs font-medium",
                          file.syncStatus === "synced"
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                            : file.syncStatus === "conflict" ||
                                file.syncStatus === "failed"
                              ? "border-red-200 bg-red-50 text-[var(--danger)]"
                              : "border-amber-200 bg-[#fff4d6] text-amber-900",
                        ].join(" ")}
                      >
                        {file.syncStatusLabel ?? "Zu pruefen"}
                      </div>
                      {file.googleDriveFileId ? (
                        <div className="mt-1 max-w-[180px] truncate font-mono text-xs text-neutral-500">
                          {file.googleDriveFileId}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{file.createdAt}</td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2">
                        <div className="flex flex-wrap gap-2">
                          {mfaReady ? (
                            <a
                              href={`/files/open?fileId=${encodeURIComponent(file.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Datei direkt oeffnen"
                              className="flex h-9 items-center gap-2 rounded-md border border-[var(--line-strong)] bg-white px-3 text-sm"
                            >
                              <ExternalLink className="size-4" aria-hidden="true" />
                              <span>Oeffnen</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              title="2FA-Sitzung freischalten"
                              disabled
                              className="flex h-9 items-center gap-2 rounded-md border border-[var(--line-strong)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <ExternalLink className="size-4" aria-hidden="true" />
                              <span>Oeffnen</span>
                            </button>
                          )}
                          {mfaReady ? (
                            <a
                              href={`/files/preview?fileId=${encodeURIComponent(file.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Dateivorschau oeffnen"
                              className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm"
                            >
                              <Eye className="size-4" aria-hidden="true" />
                              <span>Vorschau</span>
                            </a>
                          ) : null}
                          <form action={downloadFileAction}>
                            <input type="hidden" name="fileId" value={file.id} />
                            <button
                              type="submit"
                              title={
                                mfaReady
                                  ? "Datei herunterladen"
                                  : "2FA-Sitzung freischalten"
                              }
                              disabled={!mfaReady}
                              className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <Download className="size-4" aria-hidden="true" />
                              <span>Download</span>
                            </button>
                          </form>
                        </div>

                        <details className="border border-[var(--line)] bg-[var(--surface-muted)]">
                          <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs font-bold uppercase">
                            <Folder className="size-3.5" aria-hidden="true" />
                            <span>Verschieben</span>
                          </summary>
                          <form
                            action={moveFileAction}
                            className="grid gap-2 border-t border-[var(--line)] p-2"
                          >
                            <input type="hidden" name="fileId" value={file.id} />
                            <div className="grid gap-2 md:grid-cols-2">
                              <label className="grid gap-1">
                                <span className="text-xs font-medium uppercase text-neutral-500">
                                  Kategorie
                                </span>
                                <select
                                  name="categoryId"
                                  required
                                  defaultValue={file.categoryId}
                                  disabled={!mfaReady || categories.length === 0}
                                  className="h-9 border border-[var(--line)] bg-white px-2 text-xs outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  {categories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1">
                                <span className="text-xs font-medium uppercase text-neutral-500">
                                  Ordner
                                </span>
                                <select
                                  name="folderId"
                                  defaultValue={file.folderId}
                                  disabled={!mfaReady}
                                  className="h-9 border border-[var(--line)] bg-white px-2 text-xs outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  <option value="">Ohne Ordner</option>
                                  {folders.map((folder) => (
                                    <option key={folder.id} value={folder.id}>
                                      {folder.category} / {folder.folder}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <input
                              name="reason"
                              disabled={!mfaReady}
                              placeholder="Grund optional"
                              className="h-9 border border-[var(--line)] bg-white px-2 text-xs outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                            />
                            <button
                              type="submit"
                              disabled={!mfaReady || categories.length === 0}
                              className="flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <Save className="size-4" aria-hidden="true" />
                              <span>Verschieben</span>
                            </button>
                          </form>
                        </details>

                        <details className="border border-red-200 bg-white">
                          <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs font-bold uppercase text-[var(--danger)]">
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            <span>Loeschen</span>
                          </summary>
                          <form
                            action={deleteFileAction}
                            className="grid gap-2 border-t border-red-200 p-2"
                          >
                            <input type="hidden" name="fileId" value={file.id} />
                            <input
                              name="reason"
                              required
                              minLength={8}
                              disabled={!mfaReady}
                              placeholder="Grund fuer Loeschung"
                              className="h-9 border border-red-200 bg-white px-2 text-xs outline-none focus:border-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-45"
                            />
                            <button
                              type="submit"
                              disabled={!mfaReady}
                              className="flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                              <span>Endgueltig loeschen</span>
                            </button>
                          </form>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmpty colSpan={6} label="Keine Dateien fuer diesen Filter." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details
        id="folder-create"
        className="border border-[var(--line-strong)] bg-[var(--surface)]"
      >
        <summary className="flex cursor-pointer items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-sm font-bold uppercase">
          <Folder className="size-4" aria-hidden="true" />
          <span>Ordner anlegen</span>
        </summary>
        <form
          action={createFolderAction}
          className="grid gap-3 border-t border-[var(--line)] p-4 lg:grid-cols-[1fr_1fr_1.2fr_auto]"
        >
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Kategorie
            </span>
            <select
              name="categoryId"
              required
              disabled={!mfaReady || categories.length === 0}
              defaultValue=""
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="">Kategorie waehlen</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Ueberordner
            </span>
            <select
              name="parentFolderId"
              disabled={!mfaReady || folders.length === 0}
              defaultValue=""
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="">Kein Unterordner</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.category} / {folder.folder}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Ordnername
            </span>
            <input
              name="name"
              required
              minLength={2}
              disabled={!mfaReady}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              title="Ordner anlegen"
              disabled={!mfaReady || categories.length === 0}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 lg:w-auto"
            >
              <Folder className="size-4" aria-hidden="true" />
              <span>Anlegen</span>
            </button>
          </div>
        </form>
      </details>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader icon={Folder} title="Ordnerrechte" />
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Kategorie</th>
                <th className="px-4 py-3 font-medium">Ordner</th>
                <th className="px-4 py-3 font-medium">Rechte</th>
                <th className="px-4 py-3 font-medium">Dateien</th>
                <th className="px-4 py-3 font-medium">Recht setzen</th>
                <th className="px-4 py-3 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {folders.length > 0 ? (
                folders.map((folder) => (
                  <tr key={folder.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">{folder.category}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{folder.folder}</div>
                      <div className="mt-1 inline-flex border border-[var(--line)] bg-white px-1.5 py-0.5 text-xs text-neutral-600">
                        {folder.syncStatusLabel ?? "Zu pruefen"}
                      </div>
                      {folder.googleDriveFolderId ? (
                        <div className="mt-1 max-w-[220px] truncate font-mono text-xs text-neutral-500">
                          {folder.googleDriveFolderId}
                        </div>
                      ) : null}
                      <div className="text-xs text-neutral-500">
                        Sicht: {folder.visibleFor}
                      </div>
                      <div className="text-xs text-neutral-500">
                        Upload: {folder.uploadFor}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <FolderPermissionChips folder={folder} mfaReady={mfaReady} />
                    </td>
                    <td className="px-4 py-3">{formatNumber(folder.files)}</td>
                    <td className="px-4 py-3">
                      <FolderPermissionForm
                        folder={folder}
                        mfaReady={mfaReady}
                        roles={roleOptions}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <form action={deleteFolderAction}>
                        <input type="hidden" name="folderId" value={folder.id} />
                        <button
                          type="submit"
                          title={
                            folder.files > 0
                              ? "Nur leere Ordner loeschen"
                              : "Ordner loeschen"
                          }
                          disabled={!mfaReady || folder.files > 0}
                          className="flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          <span>Loeschen</span>
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmpty colSpan={6} label="Noch keine Ordner angelegt." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FolderPermissionChips({
  folder,
  mfaReady,
}: {
  folder: WorkspaceFolder;
  mfaReady: boolean;
}) {
  if (folder.permissions.length === 0) {
    return <span className="text-xs text-neutral-500">Keine Rechte gesetzt</span>;
  }

  return (
    <div className="flex max-w-xl flex-wrap gap-1">
      {folder.permissions.map((permission) => (
        <form
          key={permission.roleId}
          action={setFolderPermissionAction}
          className="inline-flex"
        >
          <input type="hidden" name="folderId" value={folder.id} />
          <input type="hidden" name="roleId" value={permission.roleId} />
          <input type="hidden" name="intent" value="remove" />
          <button
            type="submit"
            title={`${permission.role} entziehen`}
            disabled={!mfaReady}
            className="flex h-8 items-center gap-1 rounded-md bg-[var(--surface-muted)] px-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="max-w-56 truncate">
              {permission.role}: {getFolderPermissionLabel(permission)}
            </span>
            <XCircle className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        </form>
      ))}
    </div>
  );
}

function FolderPermissionForm({
  folder,
  mfaReady,
  roles,
}: {
  folder: WorkspaceFolder;
  mfaReady: boolean;
  roles: WorkspaceRoleRow[];
}) {
  return (
    <form action={setFolderPermissionAction} className="grid gap-2">
      <input type="hidden" name="folderId" value={folder.id} />
      <input type="hidden" name="intent" value="save" />
      <div className="flex min-w-[300px] items-center gap-2">
        <select
          name="roleId"
          required
          disabled={!mfaReady || roles.length === 0}
          defaultValue=""
          className="h-9 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <option value="">Rolle waehlen</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.role}
            </option>
          ))}
        </select>
        <button
          type="submit"
          title="Ordnerrecht speichern"
          disabled={!mfaReady || roles.length === 0}
          className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Save className="size-4" aria-hidden="true" />
          <span>Speichern</span>
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1 text-xs xl:grid-cols-7">
        <PermissionCheckbox disabled={!mfaReady} label="Sicht" name="canView" />
        <PermissionCheckbox disabled={!mfaReady} label="Oeffnen" name="canOpen" />
        <PermissionCheckbox disabled={!mfaReady} label="Upload" name="canUpload" />
        <PermissionCheckbox
          disabled={!mfaReady}
          label="Download"
          name="canDownload"
        />
        <PermissionCheckbox disabled={!mfaReady} label="Edit" name="canEdit" />
        <PermissionCheckbox disabled={!mfaReady} label="Delete" name="canDelete" />
        <PermissionCheckbox
          disabled={!mfaReady}
          label="Rechte"
          name="canManagePermissions"
        />
      </div>
    </form>
  );
}

function PermissionCheckbox({
  disabled,
  label,
  name,
}: {
  disabled: boolean;
  label: string;
  name: string;
}) {
  return (
    <label className="flex h-8 items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2">
      <input
        type="checkbox"
        name={name}
        disabled={disabled}
        className="size-3.5 accent-[var(--accent)] disabled:cursor-not-allowed"
      />
      <span className="truncate">{label}</span>
    </label>
  );
}

function getFolderPermissionLabel(permission: WorkspaceFolderPermission) {
  const labels = [
    permission.canView ? "Sicht" : "",
    permission.canOpen ? "Oeffnen" : "",
    permission.canUpload ? "Upload" : "",
    permission.canDownload ? "Download" : "",
    permission.canEdit ? "Edit" : "",
    permission.canDelete ? "Delete" : "",
    permission.canManagePermissions ? "Rechte" : "",
  ].filter(Boolean);

  return labels.join(", ") || "Keine";
}

function getProtectedAssignmentReason(
  roleKey: string,
  rootAssignments: number,
  platformAdminAssignments: number,
) {
  if (roleKey === rootRoleKey && rootAssignments <= 1) {
    return "Letzter Root Owner bleibt aktiv";
  }

  if (roleKey === platformAdminRoleKey && platformAdminAssignments <= 1) {
    return "Letzter Administrator bleibt aktiv";
  }

  return "";
}

function isProtectedPermissionRemoval(roleKey: string, permissionKey: string) {
  if (roleKey === rootRoleKey) {
    return true;
  }

  return (
    roleKey === platformAdminRoleKey &&
    platformAdminCorePermissionKeys.has(permissionKey)
  );
}

function CategoriesSection({
  categories,
  mfaReady,
}: {
  categories: WorkspaceCategory[];
  mfaReady: boolean;
}) {
  const activeCount = categories.filter((category) => category.active).length;
  const inactiveCount = categories.length - activeCount;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <DetailBox label="Kategorien" value={formatNumber(categories.length)} />
        <DetailBox label="Aktiv" value={formatNumber(activeCount)} />
        <DetailBox label="Deaktiviert" value={formatNumber(inactiveCount)} />
      </div>

      <details className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <summary className="flex cursor-pointer items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-sm font-bold uppercase">
          <Plus className="size-4" aria-hidden="true" />
          <span>Kategorie anlegen</span>
        </summary>
        <form
          action={saveCategoryAction}
          className="grid gap-3 p-3 lg:grid-cols-[1fr_1.6fr_120px_auto_auto]"
        >
          <fieldset disabled={!mfaReady} className="contents disabled:opacity-60">
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Name
              </span>
              <input
                name="name"
                required
                minLength={2}
                className="h-9 border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Beschreibung
              </span>
              <input
                name="description"
                className="h-9 border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Reihenfolge
              </span>
              <input
                name="sortOrder"
                type="number"
                min={0}
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                name="active"
                type="checkbox"
                defaultChecked
                className="size-4 accent-[var(--accent)]"
              />
              <span>Aktiv</span>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!mfaReady}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 lg:w-auto"
              >
                <Save className="size-4" aria-hidden="true" />
                <span>Anlegen</span>
              </button>
            </div>
          </fieldset>
        </form>
      </details>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader icon={Folder} title="Kategorien" />
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Beschreibung</th>
                <th className="px-4 py-3 font-medium">Reihenfolge</th>
                <th className="px-4 py-3 font-medium">Aktiv</th>
                <th className="px-4 py-3 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
          {categories.length > 0 ? (
            categories.map((category) => {
              const formId = `category-${category.id}`;

              return (
                <tr key={category.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">
                    <input
                      form={formId}
                      name="name"
                      defaultValue={category.name}
                      required
                      minLength={2}
                      disabled={!mfaReady}
                      className="h-9 w-full border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                    />
                  </td>
                  <td className="px-4 py-3">
                  <input
                    form={formId}
                    name="description"
                    defaultValue={category.description}
                    disabled={!mfaReady}
                    className="h-9 w-full border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                  />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      form={formId}
                      name="sortOrder"
                      type="number"
                      min={0}
                      defaultValue={category.sortOrder}
                      disabled={!mfaReady}
                      className="h-9 w-24 border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                    />
                  </td>
                  <td className="px-4 py-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      form={formId}
                      name="active"
                      type="checkbox"
                      defaultChecked={category.active}
                      disabled={!mfaReady}
                      className="size-4 accent-[var(--accent)] disabled:cursor-not-allowed"
                    />
                    <span>Aktiv</span>
                  </label>
                  </td>
                  <td className="px-4 py-3">
                  <form id={formId} action={saveCategoryAction}>
                    <input type="hidden" name="categoryId" value={category.id} />
                  <button
                    type="submit"
                    disabled={!mfaReady}
                    className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Save className="size-4" aria-hidden="true" />
                    <span>Speichern</span>
                  </button>
                  </form>
                  </td>
                </tr>
              );
            })
          ) : (
            <TableEmpty colSpan={5} label="Noch keine Kategorien angelegt." />
          )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UsersSection({
  authStatus,
  mfaReady,
  roles,
  users,
}: {
  authStatus: AuthStatus;
  mfaReady: boolean;
  roles: WorkspaceRoleRow[];
  users: WorkspaceUserSummary;
}) {
  const roleOptions = roles.filter((role) => role.id && role.role && role.active);
  const currentUser = users.rows.find((user) => user.id === authStatus.userId);
  const canManageTwoFactorRequirement = Boolean(
    currentUser?.roles.some((role) => role.roleKey === rootRoleKey),
  );
  const rootAssignments = users.rows.filter((user) =>
    user.status !== "disabled" &&
    user.roles.some((role) => role.roleKey === rootRoleKey),
  ).length;
  const platformAdminAssignments = users.rows.filter((user) =>
    user.status !== "disabled" &&
    user.roles.some((role) => role.roleKey === platformAdminRoleKey),
  ).length;

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <SectionHeader
        icon={Users}
        title="Benutzerverwaltung"
        action={
          <a
            href="/security"
            className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            <span>2FA</span>
          </a>
        }
      />
      <div className="grid gap-3 border-t border-[var(--line)] p-4 md:grid-cols-5">
        {[
          ["Aktiv", users.active],
          ["2FA aktiv", users.mfaEnabled],
          ["2FA Pflicht", users.mfaRequired],
          ["2FA befreit", users.mfaRequirementDisabled],
          ["Deaktiviert", users.disabled],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-lg border border-[var(--line)] bg-white p-4"
          >
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{formatNumber(Number(value))}</p>
          </article>
        ))}
      </div>
      {!mfaReady ? (
        <div className="border-t border-[var(--line)] px-4 py-3">
          <div className="rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900">
            2FA-Sitzung freischalten, bevor Rollen geaendert werden.
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto border-t border-[var(--line)]">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Benutzer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">2FA-Pflicht</th>
              <th className="px-4 py-3 font-medium">Rollen</th>
              <th className="px-4 py-3 font-medium">Zuweisen</th>
            </tr>
          </thead>
          <tbody>
            {users.rows.length > 0 ? (
              users.rows.map((user) => (
                <tr key={user.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">
                    <div className="font-medium">{user.displayName}</div>
                    <div className="font-mono text-xs text-neutral-700">
                      @{user.username}
                    </div>
                    <div className="truncate font-mono text-xs text-neutral-500">
                      {user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          user.status === "disabled"
                            ? "bg-[var(--surface-muted)] text-neutral-600"
                            : "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
                        ].join(" ")}
                      >
                        {user.statusLabel}
                      </span>
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          user.twoFactorEnabled
                            ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                            : "bg-[#fff4d6] text-[var(--warning)]",
                        ].join(" ")}
                      >
                        {user.twoFactorEnabled ? "2FA aktiv" : "2FA offen"}
                      </span>
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          user.twoFactorRequired
                            ? "bg-[var(--surface-muted)] text-neutral-700"
                            : "bg-red-50 text-[var(--danger)]",
                        ].join(" ")}
                      >
                        {user.twoFactorRequired ? "Pflicht an" : "Pflicht aus"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <form
                      action={setUserTwoFactorRequirementAction}
                      className="grid min-w-[190px] gap-2"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <input
                        type="hidden"
                        name="intent"
                        value={user.twoFactorRequired ? "disable" : "require"}
                      />
                      <div className="text-xs text-neutral-600">
                        {user.twoFactorRequired
                          ? "Nach Login verlangt"
                          : "Root-Freigabe ohne 2FA"}
                      </div>
                      <button
                        type="submit"
                        title={
                          canManageTwoFactorRequirement
                            ? user.twoFactorRequired
                              ? "2FA-Pflicht deaktivieren"
                              : "2FA-Pflicht wieder aktivieren"
                            : "Nur Root Owner darf die 2FA-Pflicht steuern"
                        }
                        disabled={!canManageTwoFactorRequirement}
                        className={[
                          "flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45",
                          user.twoFactorRequired
                            ? "bg-[var(--danger)] text-white"
                            : "border border-[var(--line)] bg-white text-[var(--foreground)]",
                        ].join(" ")}
                      >
                        <KeyRound className="size-4" aria-hidden="true" />
                        <span>
                          {user.twoFactorRequired ? "Deaktivieren" : "Erzwingen"}
                        </span>
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length > 0 ? (
                        user.roles.map((role) => {
                          const protectedAssignmentReason =
                            getProtectedAssignmentReason(
                              role.roleKey,
                              rootAssignments,
                              platformAdminAssignments,
                            );

                          return (
                            <form
                              key={role.id}
                              action={setUserRoleAction}
                              className="inline-flex"
                            >
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="roleId" value={role.id} />
                              <input type="hidden" name="intent" value="remove" />
                              <button
                                type="submit"
                                title={
                                  protectedAssignmentReason
                                    ? protectedAssignmentReason
                                    : `${role.role} entziehen`
                                }
                                disabled={!mfaReady || Boolean(protectedAssignmentReason)}
                                className="flex h-8 items-center gap-1 rounded-md bg-[var(--surface-muted)] px-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <span>{role.role}</span>
                                <XCircle className="size-3.5" aria-hidden="true" />
                              </button>
                            </form>
                          );
                        })
                      ) : (
                        <span className="text-xs text-neutral-500">
                          Keine Rollen
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <form
                      action={setUserRoleAction}
                      className="flex min-w-[280px] items-center gap-2"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="intent" value="assign" />
                      <select
                        name="roleId"
                        required
                        disabled={!mfaReady || roleOptions.length === 0}
                        defaultValue=""
                        className="h-9 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <option value="">Rolle waehlen</option>
                        {roleOptions.map((role) => (
                          <option
                            key={role.id}
                            value={role.id}
                            disabled={user.roles.some(
                              (assignedRole) => assignedRole.id === role.id,
                            )}
                          >
                            {role.role}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        title="Rolle zuweisen"
                        disabled={!mfaReady || roleOptions.length === 0}
                        className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <UserCog className="size-4" aria-hidden="true" />
                        <span>Zuweisen</span>
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <TableEmpty colSpan={5} label="Noch keine Benutzer sichtbar." />
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RolesSection({
  mfaReady,
  permissions,
  roles,
}: {
  mfaReady: boolean;
  permissions: WorkspacePermissionOption[];
  roles: WorkspaceRoleRow[];
}) {
  const permissionOptions = permissions.filter(
    (permission) => permission.id && permission.key && permission.key !== "*",
  );

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Plus} title="Rolle anlegen" />
        <form
          action={saveRoleAction}
          className="grid gap-3 border-t border-[var(--line)] p-4 lg:grid-cols-[180px_1fr_1.4fr_auto_auto]"
        >
          <fieldset disabled={!mfaReady} className="contents disabled:opacity-60">
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Schluessel
              </span>
              <input
                name="roleKey"
                required
                minLength={2}
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Name
              </span>
              <input
                name="name"
                required
                minLength={2}
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Beschreibung
              </span>
              <input
                name="description"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                name="active"
                type="checkbox"
                defaultChecked
                className="size-4 accent-[var(--accent)]"
              />
              <span>Aktiv</span>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!mfaReady}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 lg:w-auto"
              >
                <Save className="size-4" aria-hidden="true" />
                <span>Anlegen</span>
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={KeyRound} title="Rollen & Berechtigungen" />
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Rolle</th>
                <th className="px-4 py-3 font-medium">Berechtigungen</th>
                <th className="px-4 py-3 font-medium">Benutzer</th>
                <th className="px-4 py-3 font-medium">Recht hinzufuegen</th>
              </tr>
            </thead>
            <tbody>
              {roles.length > 0 ? (
                roles.map((row) => {
                  const rootRole = row.roleKey === rootRoleKey;
                  const alwaysActiveRole = protectedActiveRoleKeys.has(row.roleKey);
                  const readonlyRole = readonlyRoleKeys.has(row.roleKey);

                  return (
                  <tr key={row.id} className="border-t border-[var(--line)] align-top">
                    <td className="px-4 py-3">
                      <form action={saveRoleAction} className="grid min-w-[320px] gap-2">
                        <input type="hidden" name="roleId" value={row.id} />
                        {alwaysActiveRole ? (
                          <input type="hidden" name="active" value="on" />
                        ) : null}
                        <label className="grid gap-1">
                          <span className="text-xs font-medium uppercase text-neutral-500">
                            Schluessel
                          </span>
                          <input
                            name="roleKey"
                            defaultValue={row.roleKey}
                            readOnly={readonlyRole}
                            disabled={!mfaReady || rootRole}
                            className="h-9 rounded-md border border-[var(--line)] bg-white px-2 font-mono text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium uppercase text-neutral-500">
                            Name
                          </span>
                          <input
                            name="name"
                            defaultValue={row.role}
                            required
                            disabled={!mfaReady || rootRole}
                            className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium uppercase text-neutral-500">
                            Beschreibung
                          </span>
                          <input
                            name="description"
                            defaultValue={row.description}
                            disabled={!mfaReady || rootRole}
                            className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                          />
                        </label>
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              name="active"
                              type="checkbox"
                              defaultChecked={row.active}
                              disabled={!mfaReady || alwaysActiveRole}
                              className="size-4 accent-[var(--accent)] disabled:cursor-not-allowed"
                            />
                            <span>Aktiv</span>
                          </label>
                          <button
                            type="submit"
                            disabled={!mfaReady || rootRole}
                            className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                            <span>Speichern</span>
                          </button>
                        </div>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[520px] flex-wrap gap-1">
                        {row.permissionsDetailed.length > 0 ? (
                          row.permissionsDetailed.map((permission) => {
                            const protectedPermission =
                              isProtectedPermissionRemoval(row.roleKey, permission.key);

                            return (
                            <form
                              key={permission.id}
                              action={setRolePermissionAction}
                              className="inline-flex"
                            >
                              <input type="hidden" name="roleId" value={row.id} />
                              <input
                                type="hidden"
                                name="permissionId"
                                value={permission.id}
                              />
                              <input type="hidden" name="intent" value="remove" />
                              <button
                                type="submit"
                                title={
                                  protectedPermission
                                    ? "Geschuetztes Kernrecht bleibt aktiv"
                                    : `${permission.description} entfernen`
                                }
                                disabled={!mfaReady || protectedPermission}
                                className="flex h-8 items-center gap-1 rounded-md bg-[var(--surface-muted)] px-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <span>{permission.description}</span>
                                <XCircle className="size-3.5" aria-hidden="true" />
                              </button>
                            </form>
                            );
                          })
                        ) : (
                          <span className="text-xs text-neutral-500">
                            Keine Rechte sichtbar
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.members}</td>
                    <td className="px-4 py-3">
                      <form
                        action={setRolePermissionAction}
                        className="flex min-w-[300px] items-center gap-2"
                      >
                        <input type="hidden" name="roleId" value={row.id} />
                        <input type="hidden" name="intent" value="assign" />
                        <select
                          name="permissionId"
                          required
                          defaultValue=""
                          disabled={
                            !mfaReady || rootRole || permissionOptions.length === 0
                          }
                          className="h-9 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <option value="">Recht waehlen</option>
                          {permissionOptions.map((permission) => (
                            <option
                              key={permission.id}
                              value={permission.id}
                              disabled={row.permissionsDetailed.some(
                                (assignedPermission) =>
                                  assignedPermission.id === permission.id,
                              )}
                            >
                              {permission.description}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          title="Recht hinzufuegen"
                          disabled={
                            !mfaReady || rootRole || permissionOptions.length === 0
                          }
                          className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                          <span>Hinzufuegen</span>
                        </button>
                      </form>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <TableEmpty colSpan={4} label="Noch keine Rollen sichtbar." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RepresentationSection({
  absences,
  discordRoles,
  members,
  mfaReady,
  ministryRoles,
  representationEligibilities,
}: {
  absences: WorkspaceMemberAbsence[];
  discordRoles: WorkspaceDiscordRoleOption[];
  members: WorkspaceMember[];
  mfaReady: boolean;
  ministryRoles: WorkspaceRepresentationMinistryRole[];
  representationEligibilities: WorkspaceRepresentationEligibility[];
}) {
  const memberOptions = members.filter(
    (member) => member.discordOnServer && member.discordId && member.discordId !== "-",
  );
  const activeAbsences = absences.filter(
    (absence) => absence.status === "active" || absence.status === "ending",
  );
  const allRepresentations = absences.flatMap((absence) => absence.representations);
  const pendingRepresentations = allRepresentations.filter((representation) =>
    ["pending", "assigning", "ending"].includes(representation.status),
  );
  const activeMinistryRoles = ministryRoles.filter((role) => role.active);
  const roleOptions = discordRoles.filter((role) => role.discordRoleId);

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-4">
        <DetailBox label="Aktive Abmeldungen" value={formatNumber(activeAbsences.length)} />
        <DetailBox label="Bot-Auftraege" value={formatNumber(pendingRepresentations.length)} />
        <DetailBox label="Amtsrollen" value={formatNumber(activeMinistryRoles.length)} />
        <DetailBox
          label="Vertreter"
          value={formatNumber(
            representationEligibilities.filter((entry) => entry.active).length,
          )}
        />
      </div>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={CalendarOff} title="Abmeldung" />
        {!mfaReady ? (
          <div className="border-t border-[var(--line)] px-4 py-3">
            <div className="rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900">
              2FA-Sitzung freischalten, bevor Abmeldungen geaendert werden.
            </div>
          </div>
        ) : null}
        <form
          action={startMemberAbsenceAction}
          className="grid gap-3 border-t border-[var(--line)] p-4 xl:grid-cols-[1.2fr_1.6fr_220px_auto]"
        >
          <fieldset disabled={!mfaReady} className="contents disabled:opacity-60">
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Person
              </span>
              <select
                name="memberId"
                required
                defaultValue=""
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              >
                <option value="">Mitglied waehlen</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.discordName})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Grund
              </span>
              <input
                name="reason"
                minLength={8}
                required
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Rueckkehr
              </span>
              <input
                name="expectedReturnAt"
                type="datetime-local"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!mfaReady || memberOptions.length === 0}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 xl:w-auto"
              >
                <CalendarOff className="size-4" aria-hidden="true" />
                <span>Abmelden</span>
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={UserCheck} title="Laufende Amtsvertretungen" />
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Abmeldung</th>
                <th className="px-4 py-3 font-medium">Vertretungen</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Rueckkehr</th>
                <th className="px-4 py-3 font-medium">Beenden</th>
              </tr>
            </thead>
            <tbody>
              {absences.length > 0 ? (
                absences.map((absence) => (
                  <tr key={absence.id} className="border-t border-[var(--line)] align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{absence.memberName}</div>
                      <div className="font-mono text-xs text-neutral-500">
                        {absence.discordId}
                      </div>
                      <div className="mt-2 max-w-[320px] text-xs text-neutral-600">
                        {absence.reason}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2">
                        {absence.representations.length > 0 ? (
                          absence.representations.map((representation) => (
                            <RepresentationRow
                              key={representation.id}
                              representation={representation}
                            />
                          ))
                        ) : (
                          <span className="text-xs text-neutral-500">
                            Keine Amtsrolle betroffen
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          getRepresentationStatusClass(absence.status),
                        ].join(" ")}
                      >
                        {absence.statusLabel}
                      </span>
                      <div className="mt-2 text-xs text-neutral-500">
                        Start: {absence.startedAt}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{absence.expectedReturnAt}</div>
                      {absence.endedAt !== "-" ? (
                        <div className="mt-1 text-xs text-neutral-500">
                          Ende: {absence.endedAt}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {absence.status === "active" || absence.status === "ending" ? (
                        <form action={endMemberAbsenceAction} className="grid gap-2">
                          <input type="hidden" name="absenceId" value={absence.id} />
                          <input
                            name="reason"
                            minLength={8}
                            required
                            placeholder="Grund fuer Rueckkehr"
                            disabled={!mfaReady || absence.status === "ending"}
                            className="h-9 min-w-[240px] rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                          />
                          <button
                            type="submit"
                            disabled={!mfaReady || absence.status === "ending"}
                            className="flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                            <span>Beenden</span>
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-neutral-500">
                          {absence.endedBy}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmpty colSpan={5} label="Noch keine Abmeldungen vorhanden." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={KeyRound} title="Amtsrollen" />
        <form
          action={saveRepresentationMinistryRoleAction}
          className="grid gap-3 border-t border-[var(--line)] p-4 lg:grid-cols-[1.2fr_1.6fr_120px_auto_auto]"
        >
          <fieldset disabled={!mfaReady} className="contents disabled:opacity-60">
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Name
              </span>
              <input
                name="name"
                required
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Discord-Rolle
              </span>
              <select
                name="discordRoleId"
                required
                defaultValue=""
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              >
                <option value="">Rolle waehlen</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.discordRoleId}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Prioritaet
              </span>
              <input
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={100}
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input name="active" type="checkbox" defaultChecked className="size-4" />
              <span>Aktiv</span>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!mfaReady || roleOptions.length === 0}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 lg:w-auto"
              >
                <Save className="size-4" aria-hidden="true" />
                <span>Anlegen</span>
              </button>
            </div>
          </fieldset>
        </form>
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Discord-Rolle</th>
                <th className="px-4 py-3 font-medium">Prioritaet</th>
                <th className="px-4 py-3 font-medium">Speichern</th>
              </tr>
            </thead>
            <tbody>
              {ministryRoles.length > 0 ? (
                ministryRoles.map((role) => (
                  <tr key={role.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">
                      <form
                        id={`ministry-role-${role.id}`}
                        action={saveRepresentationMinistryRoleAction}
                        className="contents"
                      >
                        <input type="hidden" name="ministryRoleId" value={role.id} />
                        <input
                          name="name"
                          required
                          defaultValue={role.name}
                          disabled={!mfaReady}
                          className="h-9 w-full rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-45"
                        />
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        form={`ministry-role-${role.id}`}
                        name="discordRoleId"
                        required
                        defaultValue={role.discordRoleId}
                        disabled={!mfaReady}
                        className="h-9 w-full rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-45"
                      >
                        {roleOptions.map((option) => (
                          <option key={option.id} value={option.discordRoleId}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        form={`ministry-role-${role.id}`}
                        name="sortOrder"
                        type="number"
                        min={0}
                        defaultValue={role.sortOrder}
                        disabled={!mfaReady}
                        className="h-9 w-28 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-45"
                      />
                      <label className="ml-3 inline-flex items-center gap-2 text-sm">
                        <input
                          form={`ministry-role-${role.id}`}
                          name="active"
                          type="checkbox"
                          defaultChecked={role.active}
                          disabled={!mfaReady}
                          className="size-4"
                        />
                        <span>Aktiv</span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        form={`ministry-role-${role.id}`}
                        type="submit"
                        disabled={!mfaReady}
                        className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Save className="size-4" aria-hidden="true" />
                        <span>Speichern</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmpty colSpan={4} label="Noch keine Amtsrollen konfiguriert." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Users} title="Vertretungsberechtigungen" />
        <RepresentationEligibilityForm
          activeMinistryRoles={activeMinistryRoles}
          memberOptions={memberOptions}
          mfaReady={mfaReady}
        />
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Amtsrollen</th>
                <th className="px-4 py-3 font-medium">Prioritaet</th>
                <th className="px-4 py-3 font-medium">Notiz</th>
                <th className="px-4 py-3 font-medium">Speichern</th>
              </tr>
            </thead>
            <tbody>
              {representationEligibilities.length > 0 ? (
                representationEligibilities.map((eligibility) => (
                  <tr key={eligibility.id} className="border-t border-[var(--line)] align-top">
                    <td className="px-4 py-3">
                      <form
                        id={`eligibility-${eligibility.id}`}
                        action={saveRepresentationEligibilityAction}
                        className="contents"
                      >
                        <input type="hidden" name="eligibilityId" value={eligibility.id} />
                        <select
                          name="memberId"
                          required
                          defaultValue={eligibility.memberId}
                          disabled={!mfaReady}
                          className="h-9 min-w-[260px] rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-45"
                        >
                          {memberOptions.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name} ({member.discordName})
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 font-mono text-xs text-neutral-500">
                          {eligibility.discordId}
                        </div>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <MinistryRoleCheckboxes
                        formId={`eligibility-${eligibility.id}`}
                        ministryRoles={activeMinistryRoles}
                        selectedIds={eligibility.allowedMinistryRoleIds}
                        disabled={!mfaReady}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        form={`eligibility-${eligibility.id}`}
                        name="priority"
                        type="number"
                        min={0}
                        defaultValue={eligibility.priority}
                        disabled={!mfaReady}
                        className="h-9 w-28 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-45"
                      />
                      <label className="mt-3 flex items-center gap-2 text-sm">
                        <input
                          form={`eligibility-${eligibility.id}`}
                          name="active"
                          type="checkbox"
                          defaultChecked={eligibility.active}
                          disabled={!mfaReady}
                          className="size-4"
                        />
                        <span>Aktiv</span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        form={`eligibility-${eligibility.id}`}
                        name="notes"
                        defaultValue={eligibility.notes}
                        disabled={!mfaReady}
                        className="h-9 min-w-[220px] rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-45"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        form={`eligibility-${eligibility.id}`}
                        type="submit"
                        disabled={!mfaReady || activeMinistryRoles.length === 0}
                        className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Save className="size-4" aria-hidden="true" />
                        <span>Speichern</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmpty colSpan={5} label="Noch keine Vertretung berechtigt." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RepresentationEligibilityForm({
  activeMinistryRoles,
  memberOptions,
  mfaReady,
}: {
  activeMinistryRoles: WorkspaceRepresentationMinistryRole[];
  memberOptions: WorkspaceMember[];
  mfaReady: boolean;
}) {
  return (
    <form
      action={saveRepresentationEligibilityAction}
      className="grid gap-3 border-t border-[var(--line)] p-4 lg:grid-cols-[1.3fr_1.4fr_120px_1fr_auto_auto]"
    >
      <fieldset disabled={!mfaReady} className="contents disabled:opacity-60">
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase text-neutral-500">
            Person
          </span>
          <select
            name="memberId"
            required
            defaultValue=""
            className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">Mitglied waehlen</option>
            {memberOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.discordName})
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-2">
          <span className="text-xs font-medium uppercase text-neutral-500">
            Amtsrollen
          </span>
          <MinistryRoleCheckboxes
            ministryRoles={activeMinistryRoles}
            selectedIds={[]}
            disabled={!mfaReady}
          />
        </div>
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase text-neutral-500">
            Prioritaet
          </span>
          <input
            name="priority"
            type="number"
            min={0}
            defaultValue={100}
            className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase text-neutral-500">
            Notiz
          </span>
          <input
            name="notes"
            className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input name="active" type="checkbox" defaultChecked className="size-4" />
          <span>Aktiv</span>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={
              !mfaReady ||
              memberOptions.length === 0 ||
              activeMinistryRoles.length === 0
            }
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 lg:w-auto"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Anlegen</span>
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function MinistryRoleCheckboxes({
  disabled,
  formId,
  ministryRoles,
  selectedIds,
}: {
  disabled: boolean;
  formId?: string;
  ministryRoles: WorkspaceRepresentationMinistryRole[];
  selectedIds: string[];
}) {
  if (ministryRoles.length === 0) {
    return <span className="text-xs text-neutral-500">Keine aktive Amtsrolle</span>;
  }

  return (
    <div className="flex max-w-[420px] flex-wrap gap-2">
      {ministryRoles.map((role) => (
        <label
          key={role.id}
          className="inline-flex min-h-8 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-2 text-xs"
        >
          <input
            form={formId}
            name="ministryRoleIds"
            type="checkbox"
            value={role.id}
            defaultChecked={selectedIds.includes(role.id)}
            disabled={disabled}
            className="size-4"
          />
          <span>{role.name}</span>
        </label>
      ))}
    </div>
  );
}

function RepresentationRow({
  representation,
}: {
  representation: WorkspaceAbsenceRepresentation;
}) {
  return (
    <div className="border border-[var(--line)] bg-white p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{representation.ministryRoleName}</span>
        <span
          className={[
            "rounded-md px-2 py-1 text-xs font-medium",
            getRepresentationStatusClass(representation.status),
          ].join(" ")}
        >
          {representation.statusLabel}
        </span>
      </div>
      <div className="mt-1 text-xs text-neutral-600">
        {representation.representativeName}
        {representation.representativeDiscordId
          ? ` - ${representation.representativeDiscordId}`
          : ""}
      </div>
      {representation.botError ? (
        <div className="mt-1 text-xs text-[var(--danger)]">
          {representation.botError}
        </div>
      ) : null}
    </div>
  );
}

function ActivitySection({ members }: { members: WorkspaceMember[] }) {
  const activityMembers = members.filter(
    (member) =>
      !member.discordAnalyticsEnabled ||
      member.messagesMonth > 0 ||
      member.voiceHoursMonth > 0 ||
      member.lastActivity !== "-",
  );
  const totalMessages = members.reduce(
    (sum, member) => sum + member.messagesMonth,
    0,
  );
  const totalVoiceHours = members.reduce(
    (sum, member) => sum + member.voiceHoursMonth,
    0,
  );
  const privacyCount = members.filter(
    (member) => !member.discordAnalyticsEnabled,
  ).length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <DetailBox label="Aktive Member" value={formatNumber(activityMembers.length)} />
        <DetailBox label="Nachrichten Monat" value={formatNumber(totalMessages)} />
        <DetailBox label="Voice-Stunden" value={formatNumber(totalVoiceHours)} />
        <DetailBox label="Datenschutz aus" value={formatNumber(privacyCount)} />
      </div>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader icon={Activity} title="Discord-Aktivitaet" />
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Mitglied</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Nachrichten</th>
                <th className="px-4 py-3 font-medium">Voice</th>
                <th className="px-4 py-3 font-medium">Letzte Aktivitaet</th>
              </tr>
            </thead>
            <tbody>
              {activityMembers.length > 0 ? (
                activityMembers.map((member) => (
                  <tr key={member.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{member.name}</div>
                      <div className="font-mono text-xs text-neutral-500">
                        {member.discordName} {"-"} {member.discordId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {member.discordAnalyticsEnabled ? (
                        <span className="bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent-strong)]">
                          Sync aktiv
                        </span>
                      ) : (
                        <span className="bg-[#fff4d6] px-2 py-1 text-xs font-medium text-[var(--warning)]">
                          Datenschutz
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatNumber(member.messagesMonth)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatNumber(member.voiceHoursMonth)} Std.
                    </td>
                    <td className="px-4 py-3">{member.lastActivity}</td>
                  </tr>
                ))
              ) : (
                <TableEmpty
                  colSpan={5}
                  label="Noch keine Discord-Aktivitaet vom Bot empfangen."
                />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ModerationSection({
  members,
  mfaReady,
  moderationEvents,
}: {
  members: WorkspaceMember[];
  mfaReady: boolean;
  moderationEvents: WorkspaceModerationEvent[];
}) {
  const [moderationSearch, setModerationSearch] = useState("");
  const moderationMembers = members.filter(
    (member) => member.discordId && member.discordId !== "-",
  );
  const query = moderationSearch.trim().toLowerCase();
  const filteredEvents = query
    ? moderationEvents.filter((event) =>
        [
          event.memberName,
          event.discordId,
          event.discordName,
          event.eventTypeLabel,
          event.statusLabel,
          event.reason,
          event.moderator,
          event.channel,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : moderationEvents;
  const activeCount = moderationEvents.filter(
    (event) => event.status === "active",
  ).length;
  const timeoutCount = moderationEvents.filter(
    (event) => event.eventType === "timeout",
  ).length;
  const banCount = moderationEvents.filter(
    (event) => event.eventType === "ban",
  ).length;
  const actionCount = moderationEvents.filter((event) =>
    ["kick", "voice_disconnect"].includes(event.eventType),
  ).length;

  return (
    <div className="grid gap-5">
      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader icon={Shield} title="Moderation ausfuehren" />
        <form
          action={runModerationAction}
          className="grid gap-3 border-t border-[var(--line-strong)] p-4 lg:grid-cols-6"
        >
          <fieldset disabled={!mfaReady} className="contents disabled:opacity-60">
            <label className="grid gap-2 lg:col-span-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Mitglied
              </span>
              <select
                name="memberId"
                defaultValue=""
                disabled={!mfaReady}
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <option value="">Aus Akte waehlen</option>
                {moderationMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.discordId})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 lg:col-span-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Oder Discord-ID
              </span>
              <input
                name="discordUserId"
                inputMode="numeric"
                placeholder="Direkt per User-ID"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              />
            </label>
            <label className="grid gap-2 lg:col-span-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Anzeigename
              </span>
              <input
                name="targetName"
                placeholder="Optional"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              />
            </label>
            <label className="grid gap-2 lg:col-span-1">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Aktion
              </span>
              <select
                name="actionType"
                required
                defaultValue="warn"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <option value="warn">Warn</option>
                <option value="timeout">Mute / Timeout</option>
                <option value="kick">Kick</option>
                <option value="voice_disconnect">Disconnect</option>
                <option value="ban">Ban</option>
              </select>
            </label>
            <label className="grid gap-2 lg:col-span-1">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Dauerart
              </span>
              <select
                name="durationMode"
                defaultValue="lifetime"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <option value="lifetime">Lifetime</option>
                <option value="timed">Minuten</option>
              </select>
            </label>
            <label className="grid gap-2 lg:col-span-1">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Minuten
              </span>
              <input
                name="durationMinutes"
                type="number"
                min={1}
                placeholder="Timeout"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              />
            </label>
            <label className="grid gap-2 lg:col-span-4">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Grund
              </span>
              <input
                name="reason"
                required
                minLength={8}
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              />
            </label>
            <div className="flex items-end lg:col-span-2">
              <button
                type="submit"
                title="Moderation ausfuehren"
                disabled={!mfaReady}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 lg:w-auto"
              >
                <Shield className="size-4" aria-hidden="true" />
                <span>Ausfuehren</span>
              </button>
            </div>
          </fieldset>
        </form>
        <div className="border-t border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-neutral-700">
          Ohne Aktenauswahl reicht eine Discord-ID. Der Railway-Bot fuehrt den
          Auftrag live aus und schreibt den Status ins Register.
        </div>
      </section>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader
          icon={Shield}
          title="Moderationsregister"
          action={
            <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs font-medium text-neutral-600">
              {formatNumber(moderationEvents.length)}
            </span>
          }
        />
        <div className="grid gap-3 border-t border-[var(--line)] p-4 md:grid-cols-4">
          {[
            ["Aktiv", activeCount],
            ["Timeouts", timeoutCount],
            ["Bans", banCount],
            ["Kicks & Disconnects", actionCount],
          ].map(([label, value]) => (
            <article
              key={label}
              className="border border-[var(--line)] bg-[var(--surface-muted)] p-3"
            >
              <p className="text-sm text-neutral-500">{label}</p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {formatNumber(Number(value))}
              </p>
            </article>
          ))}
        </div>
        <div className="border-t border-[var(--line)] p-4">
          <label className="grid max-w-xl gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Suche
            </span>
            <div className="flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3">
              <Search className="size-4 text-neutral-500" aria-hidden="true" />
              <input
                value={moderationSearch}
                onChange={(event) => setModerationSearch(event.target.value)}
                placeholder="Mitglied, Discord-ID, Grund"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </label>
        </div>
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Mitglied</th>
                <th className="px-4 py-3 font-medium">Art</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Dauer</th>
                <th className="px-4 py-3 font-medium">Zeitpunkt</th>
                <th className="px-4 py-3 font-medium">Moderator</th>
                <th className="px-4 py-3 font-medium">Grund</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length > 0 ? (
                filteredEvents.map((event) => (
                  <tr key={event.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{event.memberName}</div>
                      <div className="font-mono text-xs text-neutral-500">
                        {event.discordName} {"-"} {event.discordId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          getModerationTypeClass(event.eventType),
                        ].join(" ")}
                      >
                        {event.eventTypeLabel}
                      </span>
                      {event.channel !== "-" ? (
                        <div className="mt-1 text-xs text-neutral-500">
                          {event.channel}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          getModerationStatusClass(event.status),
                        ].join(" ")}
                      >
                        {event.statusLabel}
                      </span>
                      {event.commandError ? (
                        <div className="mt-1 max-w-[180px] truncate text-xs text-[var(--danger)]">
                          {event.commandError}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div>{event.totalDuration}</div>
                      <div className="text-xs text-neutral-500">
                        Rest: {event.remainingDuration}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{event.startedAt}</div>
                      <div className="text-xs text-neutral-500">
                        bis {event.endedAt}
                      </div>
                    </td>
                    <td className="px-4 py-3">{event.moderator}</td>
                    <td className="px-4 py-3">
                      <div className="max-w-sm truncate">{event.reason}</div>
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmpty colSpan={7} label="Keine Moderationsereignisse gefunden." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ModerationAdviceSection({
  adviceCases,
  environmentStatus,
  members,
  mfaReady,
  selectedAdviceId,
  setSelectedAdviceId,
}: {
  adviceCases: WorkspaceModerationAdviceCase[];
  environmentStatus: EnvironmentStatus;
  members: WorkspaceMember[];
  mfaReady: boolean;
  selectedAdviceId: string;
  setSelectedAdviceId: (id: string) => void;
}) {
  const [adviceSearch, setAdviceSearch] = useState("");
  const [adviceEvidenceFiles, setAdviceEvidenceFiles] = useState<File[]>([]);
  const [adviceScreenshotFiles, setAdviceScreenshotFiles] = useState<File[]>([]);
  const [adviceUploadItems, setAdviceUploadItems] = useState<AdviceUploadItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const moderationMembers = members.filter(
    (member) => member.discordId && member.discordId !== "-",
  );
  const selectedAdvice =
    adviceCases.find((adviceCase) => adviceCase.id === selectedAdviceId) ??
    adviceCases[0] ??
    null;
  const query = adviceSearch.trim().toLowerCase();
  const filteredAdviceCases = adviceCases.filter((adviceCase) => {
    const matchesStatus =
      statusFilter === "all" || adviceCase.status === statusFilter;
    const matchesQuery =
      !query ||
      [
        adviceCase.caseNumber,
        adviceCase.title,
        adviceCase.targetName,
        adviceCase.targetDiscordId,
        adviceCase.recommendedAction,
        adviceCase.statusLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return matchesStatus && matchesQuery;
  });
  const adviceReadyCount = adviceCases.filter(
    (adviceCase) => adviceCase.status === "advice_ready",
  ).length;
  const queuedCount = adviceCases.filter(
    (adviceCase) => adviceCase.status === "queued",
  ).length;
  const executedCount = adviceCases.filter((adviceCase) => adviceCase.executed).length;
  const adviceUploadValidation = getAdviceUploadValidation([
    ...adviceScreenshotFiles,
    ...adviceEvidenceFiles,
  ]);
  const adviceUploadProgress = getAdviceUploadProgress(adviceUploadItems);
  const adviceUploadBlocked = Boolean(
    adviceUploadValidation.message || adviceUploadProgress.message,
  );
  const uploadedAdviceEvidenceJson = JSON.stringify(
    adviceUploadItems
      .filter((item) => item.status === "uploaded" && item.storagePath)
      .map((item) => ({
        contentType: item.contentType,
        evidenceType: item.evidenceType,
        extractedText: item.extractedText,
        originalName: item.originalName,
        size: item.size,
        storagePath: item.storagePath,
      })),
  );
  const adviceUploadStatusText =
    adviceUploadValidation.message ||
    adviceUploadProgress.message ||
    adviceUploadProgress.summary ||
    adviceUploadValidation.summary;
  const uploadAdviceFiles = async (
    files: File[],
    evidenceType: AdviceUploadEvidenceType,
  ) => {
    const items = await Promise.all(
      files.map(async (file) => ({
        contentType: file.type || "application/octet-stream",
        evidenceType,
        extractedText: await readAdviceEvidenceText(file),
        id: crypto.randomUUID(),
        originalName: file.name || "beleg.bin",
        size: file.size,
        status: "queued" as const,
      })),
    );

    setAdviceUploadItems((current) => [
      ...current.filter((item) => item.evidenceType !== evidenceType),
      ...items,
    ]);

    await Promise.all(
      items.map(async (item, index) => {
        const file = files[index];

        setAdviceUploadItems((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, status: "uploading" }
              : currentItem,
          ),
        );

        try {
          const prepared = await prepareModerationAdviceEvidenceUploadAction({
            contentType: item.contentType,
            evidenceType,
            fileName: item.originalName,
            size: item.size,
          });
          const supabaseBrowser = createSupabaseBrowserClient();
          const { error } = await supabaseBrowser.storage
            .from("schland-files")
            .uploadToSignedUrl(prepared.path, prepared.token, file, {
              contentType: item.contentType,
              upsert: false,
            });

          if (error) {
            throw new Error(error.message);
          }

          const preparedEvidenceType =
            prepared.evidenceType === "screenshot" ? "screenshot" : "file";

          setAdviceUploadItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    contentType: prepared.contentType,
                    evidenceType: preparedEvidenceType,
                    originalName: prepared.originalName,
                    status: "uploaded",
                    storagePath: prepared.path,
                  }
                : currentItem,
            ),
          );
        } catch (error) {
          setAdviceUploadItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Upload fehlgeschlagen.",
                    status: "failed",
                  }
                : currentItem,
            ),
          );
        }
      }),
    );
  };
  const canExecuteSelected =
    Boolean(selectedAdvice) &&
    mfaReady &&
    ["warn", "kick", "ban"].includes(selectedAdvice?.recommendedAction ?? "") &&
    Boolean(selectedAdvice?.targetDiscordId && selectedAdvice.targetDiscordId !== "-") &&
    !selectedAdvice?.executionEventId &&
    selectedAdvice?.status !== "queued" &&
    selectedAdvice?.status !== "executed";
  const canCreateOfficialDocument =
    Boolean(selectedAdvice) &&
    mfaReady &&
    environmentStatus.googleDriveClientEmail &&
    environmentStatus.googleDrivePrivateKey &&
    environmentStatus.googleDocsTemplateId &&
    ["advice_ready", "saved", "queued", "executed"].includes(
      selectedAdvice?.status ?? "",
    ) &&
    Object.keys(selectedAdvice?.aiOutput ?? {}).length > 0 &&
    !selectedAdvice?.officialDocumentId;

  return (
    <div className="grid gap-5">
      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader icon={BrainCircuit} title="KI-Sanktionsberater" />
        <form
          action={createModerationAdviceCaseAction}
          encType="multipart/form-data"
          onSubmit={(event) => {
            if (adviceUploadBlocked) {
              event.preventDefault();
            }
          }}
          className="grid gap-4 border-t border-[var(--line-strong)] p-4"
        >
          <input
            type="hidden"
            name="uploadedEvidenceJson"
            value={uploadedAdviceEvidenceJson}
          />
          <fieldset disabled={!mfaReady} className="contents disabled:opacity-60">
            <div className="grid gap-3 lg:grid-cols-6">
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Titel
                </span>
                <input
                  name="title"
                  placeholder="Optionaler Arbeitstitel"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Zielperson
                </span>
                <select
                  name="targetMemberId"
                  defaultValue=""
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <option value="">Aus Akte waehlen</option>
                  {moderationMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.discordId})
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 lg:col-span-1">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Discord-ID
                </span>
                <input
                  name="targetDiscordUserId"
                  inputMode="numeric"
                  placeholder="Falls vorhanden"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-1">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Anzeigename
                </span>
                <input
                  name="targetDiscordUsername"
                  placeholder="Fallback"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Vorfallszeitpunkt
                </span>
                <input
                  name="incidentAt"
                  type="datetime-local"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-4">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Betroffene Personen
                </span>
                <input
                  name="affectedPeople"
                  placeholder="Personen, Rollen, Kanaele"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-3">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Situationsbeschreibung
                </span>
                <textarea
                  name="situationText"
                  required
                  minLength={20}
                  rows={5}
                  className="min-h-32 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-3">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Konkretes Verhalten
                </span>
                <textarea
                  name="behaviorSummary"
                  required
                  minLength={8}
                  rows={5}
                  className="min-h-32 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-3">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Links / URLs
                </span>
                <textarea
                  name="messageLinks"
                  rows={4}
                  placeholder="Discord-, Datei- oder Webseiten-URL pro Zeile"
                  className="min-h-24 rounded-md border border-[var(--line)] bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-3">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Belegnotiz
                </span>
                <textarea
                  name="evidenceNotes"
                  rows={4}
                  className="min-h-24 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Screenshots
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  aria-invalid={adviceUploadBlocked}
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    setAdviceScreenshotFiles(files);
                    void uploadAdviceFiles(files, "screenshot");
                  }}
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none file:mr-3 file:border-0 file:bg-[var(--surface-muted)] file:px-2 file:py-1 file:text-xs disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Dateien
                </span>
                <input
                  type="file"
                  multiple
                  accept={ADVICE_EVIDENCE_FILE_ACCEPT}
                  aria-invalid={adviceUploadBlocked}
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    setAdviceEvidenceFiles(files);
                    void uploadAdviceFiles(files, "file");
                  }}
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none file:mr-3 file:border-0 file:bg-[var(--surface-muted)] file:px-2 file:py-1 file:text-xs disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Gewuenschter Ausgang
                </span>
                <input
                  name="desiredOutcome"
                  placeholder="Optional, nicht bindend"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              {adviceUploadStatusText ? (
                <div
                  className={`lg:col-span-6 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    adviceUploadBlocked
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-[var(--line)] bg-[var(--surface-muted)] text-neutral-600"
                  }`}
                  role={adviceUploadBlocked ? "alert" : "status"}
                >
                  <TriangleAlert
                    className={`mt-0.5 size-4 shrink-0 ${
                      adviceUploadBlocked ? "text-amber-700" : "text-neutral-500"
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    {adviceUploadStatusText}
                  </span>
                </div>
              ) : null}
              <label className="grid gap-2 lg:col-span-6">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Interne Notizen
                </span>
                <textarea
                  name="internalNotes"
                  rows={3}
                  className="min-h-20 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="intent"
                value="create"
                disabled={!mfaReady || adviceUploadBlocked}
                className="flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Save className="size-4" aria-hidden="true" />
                <span>Beratung erstellen</span>
              </button>
              <button
                type="submit"
                name="intent"
                value="analyze"
                disabled={!mfaReady || adviceUploadBlocked}
                className="flex h-10 items-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Sparkles className="size-4" aria-hidden="true" />
                <span>KI auswerten</span>
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
          <SectionHeader
            icon={Sparkles}
            title="KI-Ergebnis"
            action={
              selectedAdvice ? (
                <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs font-medium text-neutral-600">
                  {selectedAdvice.caseNumber}
                </span>
              ) : null
            }
          />
          {selectedAdvice ? (
            <div className="grid gap-4 border-t border-[var(--line)] p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <DetailBox label="Status" value={selectedAdvice.statusLabel} />
                <DetailBox
                  label="Empfehlung"
                  value={mapAdviceActionLabel(selectedAdvice.recommendedAction)}
                />
                <DetailBox
                  label="Schwere"
                  value={
                    selectedAdvice.severityScore === null
                      ? "-"
                      : `${selectedAdvice.severityScore}/100`
                  }
                />
                <DetailBox
                  label="Vertrauen"
                  value={formatAdviceConfidence(selectedAdvice.confidence)}
                />
              </div>

              <form
                action={updateModerationAdviceTitleAction}
                className="grid gap-2 md:grid-cols-[1fr_auto]"
              >
                <input type="hidden" name="caseId" value={selectedAdvice.id} />
                <input
                  name="title"
                  defaultValue={selectedAdvice.title}
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={!mfaReady}
                  className="flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  <span>Titel aendern</span>
                </button>
              </form>

              <div className="grid gap-3 md:grid-cols-2">
                <article className="border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-medium uppercase text-neutral-500">
                    Discord-Grund
                  </p>
                  <p className="mt-2 text-sm">{selectedAdvice.recommendedReason || "-"}</p>
                </article>
                <article className="border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-medium uppercase text-neutral-500">
                    Zielperson
                  </p>
                  <p className="mt-2 text-sm font-medium">{selectedAdvice.targetName}</p>
                  <p className="font-mono text-xs text-neutral-500">
                    {selectedAdvice.targetDiscordUsername} {"-"} {selectedAdvice.targetDiscordId}
                  </p>
                </article>
                <article className="border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-medium uppercase text-neutral-500">
                    Offizielles Dokument
                  </p>
                  <p className="mt-2 font-mono text-sm font-medium">
                    {selectedAdvice.officialAz || "-"}
                  </p>
                  {selectedAdvice.officialDocumentUrl ? (
                    <a
                      href={selectedAdvice.officialDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      <span>Google Doc oeffnen</span>
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-500">
                      Noch nicht erstellt
                    </p>
                  )}
                  {selectedAdvice.officialDocumentCreatedAt ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      {selectedAdvice.officialDocumentStatus} {"-"}{" "}
                      {selectedAdvice.officialDocumentCreatedAt}
                    </p>
                  ) : null}
                </article>
              </div>

              <AdviceTextBlock
                label="Entscheidung kurz"
                value={readAdviceText(selectedAdvice.aiOutput, "decisionSummary")}
              />
              <AdviceTextBlock
                label="Begruendung"
                value={readAdviceText(selectedAdvice.aiOutput, "humanExplanation")}
              />
              <AdviceListBlock
                label="Konkrete Massnahmen"
                items={readAdviceObjectList(selectedAdvice.aiOutput, "recommendedMeasures").map(
                  (measure) =>
                    [
                      `${readAdviceText(measure, "recommendedOrder")}. ${readAdviceText(
                        measure,
                        "title",
                      )}`,
                      readAdviceText(measure, "description"),
                      `Begruendung: ${readAdviceText(measure, "whyAppropriate")}`,
                      `Art: ${readAdviceText(measure, "measureType")}`,
                      `Ausfuehrbar: ${
                        readAdviceBoolean(measure, "executable") ? "Ja" : "Nein"
                      }`,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                )}
              />
              <AdviceListBlock
                label="Erkannte Verstoesse"
                items={readAdviceObjectList(selectedAdvice.aiOutput, "ruleViolations").map(
                  (item) =>
                    `${readAdviceText(item, "ruleOrLaw")} - ${readAdviceText(
                      item,
                      "whyItApplies",
                    )}`,
                )}
              />
              <AdviceListBlock
                label="Rechtsgrundlagen"
                items={readAdviceObjectList(selectedAdvice.aiOutput, "legalBasis").map(
                  (item) =>
                    `${readAdviceText(item, "source")} ${readAdviceText(
                      item,
                      "section",
                    )}: ${readAdviceText(item, "reason")}`,
                )}
              />
              <AdviceListBlock
                label="Fehlende Informationen"
                items={readAdviceStringList(selectedAdvice.aiOutput, "missingInformation")}
              />
              <AdviceListBlock
                label="Risikohinweise"
                items={readAdviceStringList(selectedAdvice.aiOutput, "riskFlags")}
              />
              <AdviceListBlock
                label="Alternativen"
                items={readAdviceStringList(selectedAdvice.aiOutput, "alternatives")}
              />

              <div className="grid gap-3 border-t border-[var(--line)] pt-4 lg:grid-cols-4">
                <form action={analyzeModerationAdviceCaseAction}>
                  <input type="hidden" name="caseId" value={selectedAdvice.id} />
                  <button
                    type="submit"
                    disabled={!mfaReady || selectedAdvice.status === "queued"}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    <span>Neu auswerten</span>
                  </button>
                </form>
                <form action={saveModerationAdviceCaseAction} className="grid gap-2">
                  <input type="hidden" name="caseId" value={selectedAdvice.id} />
                  <input
                    type="hidden"
                    name="recommendedReason"
                    value={selectedAdvice.recommendedReason}
                  />
                  <button
                    type="submit"
                    disabled={!mfaReady}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Save className="size-4" aria-hidden="true" />
                    <span>Nur speichern</span>
                  </button>
                </form>
                <form
                  action={createModerationAdviceOfficialDocumentAction}
                  className="grid gap-2"
                >
                  <input type="hidden" name="caseId" value={selectedAdvice.id} />
                  <select
                    name="documentType"
                    defaultValue="ermittlungsvermerk"
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!canCreateOfficialDocument}
                  >
                    <option value="ermittlungsvermerk">Ermittlungsvermerk</option>
                    <option value="sanktionsvorschlag">Sanktionsvorschlag</option>
                    <option value="aktennotiz">Aktennotiz</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!canCreateOfficialDocument}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <FileText className="size-4" aria-hidden="true" />
                    <span>Offizielles Docs erstellen</span>
                  </button>
                </form>
                <form action={executeModerationAdviceAction} className="grid gap-2">
                  <input type="hidden" name="caseId" value={selectedAdvice.id} />
                  <textarea
                    name="reasonOverride"
                    defaultValue={selectedAdvice.recommendedReason}
                    rows={2}
                    className="min-h-16 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                  />
                  <button
                    type="submit"
                    disabled={!canExecuteSelected}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Shield className="size-4" aria-hidden="true" />
                    <span>Ausfuehren</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="border-t border-[var(--line)] p-4 text-sm text-neutral-500">
              Noch keine Beratung gespeichert.
            </div>
          )}
        </section>

        <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
          <SectionHeader icon={FileText} title="Detailansicht" />
          {selectedAdvice ? (
            <div className="grid gap-4 border-t border-[var(--line)] p-4 text-sm">
              <AdviceTextBlock label="Situation" value={selectedAdvice.situationText} />
              <AdviceTextBlock
                label="Konkretes Verhalten"
                value={selectedAdvice.behaviorSummary}
              />
              <AdviceListBlock
                label="Verwendete Belege"
                items={selectedAdvice.evidence.map((evidence) =>
                  [
                    mapEvidenceTypeLabel(evidence.evidenceType),
                    evidence.label,
                    evidence.externalUrl || readAdviceText(evidence.metadata, "originalName"),
                  ]
                    .filter(Boolean)
                    .join(" - "),
                )}
              />
              <AdviceListBlock
                label="Fruehere Warns, Bans und Kicks"
                items={readSnapshotRows(selectedAdvice.priorHistorySnapshot).map((row) =>
                  [
                    readAdviceText(row, "eventType"),
                    readAdviceText(row, "startedAt"),
                    readAdviceText(row, "reason"),
                  ]
                    .filter(Boolean)
                    .join(" - "),
                )}
              />
              <AdviceListBlock
                label="Geladene Regelwerke"
                items={readSnapshotDocuments(selectedAdvice.legalBasisSnapshot).map((doc) =>
                  [
                    readAdviceText(doc, "source"),
                    readAdviceText(doc, "documentName"),
                    readAdviceText(doc, "revision") || readAdviceText(doc, "modifiedTime"),
                  ]
                    .filter(Boolean)
                    .join(" - "),
                )}
              />
              <div className="grid gap-2">
                <p className="text-xs font-medium uppercase text-neutral-500">
                  Ereignisprotokoll
                </p>
                <div className="grid gap-2">
                  {selectedAdvice.logs.length > 0 ? (
                    selectedAdvice.logs.slice(0, 8).map((log) => (
                      <div
                        key={log.id}
                        className="border border-[var(--line)] bg-[var(--surface-muted)] p-2"
                      >
                        <div className="font-medium">
                          {mapAdviceLogAction(log.action)}
                        </div>
                        <div className="text-xs text-neutral-500">{log.createdAt}</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-neutral-500">Noch kein Protokoll.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-[var(--line)] p-4 text-sm text-neutral-500">
              Keine Fallakte ausgewaehlt.
            </div>
          )}
        </section>
      </div>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <SectionHeader
          icon={FileText}
          title="Gespeicherte Beratungen"
          action={
            <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs font-medium text-neutral-600">
              {formatNumber(adviceCases.length)}
            </span>
          }
        />
        <div className="grid gap-3 border-t border-[var(--line)] p-4 md:grid-cols-4">
          {[
            ["Bereit", adviceReadyCount],
            ["Queue", queuedCount],
            ["Ausgefuehrt", executedCount],
            ["Gesamt", adviceCases.length],
          ].map(([label, value]) => (
            <article
              key={label}
              className="border border-[var(--line)] bg-[var(--surface-muted)] p-3"
            >
              <p className="text-sm text-neutral-500">{label}</p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {formatNumber(Number(value))}
              </p>
            </article>
          ))}
        </div>
        <div className="grid gap-3 border-t border-[var(--line)] p-4 md:grid-cols-[1fr_220px]">
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Suche
            </span>
            <div className="flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3">
              <Search className="size-4 text-neutral-500" aria-hidden="true" />
              <input
                value={adviceSearch}
                onChange={(event) => setAdviceSearch(event.target.value)}
                placeholder="Aktenzeichen, Titel, Zielperson"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase text-neutral-500">
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="all">Alle</option>
              <option value="draft">Entwurf</option>
              <option value="analyzing">KI prueft</option>
              <option value="advice_ready">Empfehlung bereit</option>
              <option value="saved">Gespeichert</option>
              <option value="queued">Bot wartet</option>
              <option value="executed">Ausgefuehrt</option>
              <option value="failed">Fehler</option>
              <option value="cancelled">Abgebrochen</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Aktenzeichen</th>
                <th className="px-4 py-3 font-medium">Titel</th>
                <th className="px-4 py-3 font-medium">Zielperson</th>
                <th className="px-4 py-3 font-medium">Empfehlung</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Erstellt</th>
                <th className="px-4 py-3 font-medium">Aktualisiert</th>
                <th className="px-4 py-3 font-medium">Ausgefuehrt</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdviceCases.length > 0 ? (
                filteredAdviceCases.map((adviceCase) => (
                  <tr
                    key={adviceCase.id}
                    className="border-t border-[var(--line)]"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(adviceCase.caseNumber);
                        }}
                        className="flex items-center gap-2 font-mono text-xs font-bold text-[var(--foreground)]"
                      >
                        <Copy className="size-3.5" aria-hidden="true" />
                        <span>{adviceCase.caseNumber}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedAdviceId(adviceCase.id)}
                        className="text-left font-medium text-[var(--foreground)] underline-offset-2 hover:underline"
                      >
                        {adviceCase.title}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div>{adviceCase.targetName}</div>
                      <div className="font-mono text-xs text-neutral-500">
                        {adviceCase.targetDiscordId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          getAdviceActionClass(adviceCase.recommendedAction),
                        ].join(" ")}
                      >
                        {mapAdviceActionLabel(adviceCase.recommendedAction)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          getAdviceStatusClass(adviceCase.status),
                        ].join(" ")}
                      >
                        {adviceCase.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">{adviceCase.createdAt}</td>
                    <td className="px-4 py-3">{adviceCase.updatedAt}</td>
                    <td className="px-4 py-3">
                      {adviceCase.executed ? "Ja" : "Nein"}
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmpty colSpan={8} label="Keine Beratungen gefunden." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AdviceTextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium uppercase text-neutral-500">{label}</p>
      <p className="whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm leading-6">
        {value || "-"}
      </p>
    </div>
  );
}

function AdviceListBlock({ label, items }: { label: string; items: string[] }) {
  const visibleItems = items.map((item) => item.trim()).filter(Boolean);

  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium uppercase text-neutral-500">{label}</p>
      {visibleItems.length > 0 ? (
        <ul className="grid gap-2">
          {visibleItems.map((item, index) => (
            <li
              key={`${label}-${index}-${item}`}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm leading-6"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-neutral-500">
          -
        </p>
      )}
    </div>
  );
}

function SyncSection({
  discordInvites,
  mfaReady,
  sync,
}: {
  discordInvites: WorkspaceDiscordInvite[];
  mfaReady: boolean;
  sync: WorkspaceSyncStatus;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-4">
        <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
          <SectionHeader
            icon={Bot}
            title="Discord-Synchronisation"
            action={
              <form action={runDiscordManualSyncAction}>
                <button
                  type="submit"
                  title="Ansicht mit Railway-Live-Sync aktualisieren"
                  className="flex h-8 items-center gap-2 border border-[var(--line)] bg-white px-3 text-xs font-bold text-[var(--foreground)]"
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  <span>Aktualisieren</span>
                </button>
              </form>
            }
          />
          <div className="grid gap-3 border-t border-[var(--line-strong)] p-3 md:grid-cols-4">
            <DetailBox label="Live-Signal" value={sync.lastFullSync} />
            <DetailBox
              label="Discord Server"
              value={
                sync.memberServerEstimate !== null
                  ? formatNumber(sync.memberServerEstimate)
                  : "-"
              }
            />
            <DetailBox label="Erfasst" value={formatNumber(sync.memberScanned)} />
            <DetailBox label="Fehler" value={formatNumber(sync.errorCount)} />
          </div>
          <div className="grid gap-2 border-t border-[var(--line)] p-3">
            {sync.rows.map(({ active, label, status }) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 border-b border-[var(--line)] py-2 last:border-b-0"
              >
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-sm text-neutral-500">{status}</p>
                </div>
                {active ? (
                  <CheckCircle2
                    className="size-5 text-[var(--accent)]"
                    aria-hidden="true"
                  />
                ) : (
                  <Clock className="size-5 text-[var(--warning)]" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
          <SectionHeader
            icon={Plus}
            title="Discord-Einladungen"
            action={
              <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs font-medium text-neutral-600">
                1x / 1 Tag
              </span>
            }
          />
          <form
            action={createDiscordInviteRequestAction}
            className="grid gap-3 border-t border-[var(--line)] p-4 xl:grid-cols-[1fr_1fr_1.4fr_auto]"
          >
            <fieldset
              disabled={!mfaReady}
              className="contents disabled:opacity-60"
            >
              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Discord User-ID
                </span>
                <input
                  name="inviteeDiscordId"
                  required
                  inputMode="numeric"
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Name
                </span>
                <input
                  name="inviteeName"
                  minLength={2}
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  Grund
                </span>
                <input
                  name="reason"
                  required
                  minLength={8}
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  title="Einladung als Datenbankauftrag anlegen"
                  disabled={!mfaReady}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 xl:w-auto"
                >
                  <Save className="size-4" aria-hidden="true" />
                  <span>Anlegen</span>
                </button>
              </div>
            </fieldset>
          </form>
          {!mfaReady ? (
            <div className="border-t border-[var(--line)] px-4 py-3">
              <div className="rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900">
                2FA-Sitzung freischalten, bevor Discord-Einladungen angelegt werden.
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto border-t border-[var(--line)]">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Einladung</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">DM</th>
                  <th className="px-4 py-3 font-medium">Discord-Link</th>
                  <th className="px-4 py-3 font-medium">Gueltigkeit</th>
                  <th className="px-4 py-3 font-medium">Grund</th>
                  <th className="px-4 py-3 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {discordInvites.length > 0 ? (
                  discordInvites.map((invite) => (
                    <tr key={invite.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-3">
                        <div className="font-medium">{invite.inviteeName}</div>
                        <div className="font-mono text-xs text-neutral-500">
                          {invite.inviteeDiscordId || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "rounded-md px-2 py-1 text-xs font-medium",
                            getInviteStatusClass(invite.status),
                          ].join(" ")}
                        >
                          {invite.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "rounded-md px-2 py-1 text-xs font-medium",
                            getInviteDmStatusClass(invite.dmStatus),
                          ].join(" ")}
                        >
                          {mapInviteDmStatus(invite.dmStatus)}
                        </span>
                        {invite.dmError ? (
                          <div className="mt-1 max-w-[180px] truncate text-xs text-[var(--danger)]">
                            {invite.dmError}
                          </div>
                        ) : invite.dmSentAt !== "-" ? (
                          <div className="mt-1 text-xs text-neutral-500">
                            {invite.dmSentAt}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {invite.discordInviteUrl ? (
                          <a
                            href={invite.discordInviteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-xs font-medium text-[var(--accent-strong)]"
                          >
                            <ExternalLink className="size-3" aria-hidden="true" />
                            <span>Oeffnen</span>
                          </a>
                        ) : invite.botError ? (
                          <span className="block max-w-[180px] truncate text-xs text-[var(--danger)]">
                            {invite.botError}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          {invite.uses}/{invite.maxUses} genutzt
                        </div>
                        <div className="text-xs text-neutral-500">
                          bis {invite.expiresAt}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-xs truncate">{invite.reason}</div>
                        <div className="text-xs text-neutral-500">
                          {invite.requestedBy} {"-"} {invite.createdAt}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <form action={deleteDiscordInviteRequestAction}>
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <button
                            type="submit"
                            title="Einladung loeschen und Link widerrufen"
                            disabled={!mfaReady}
                            className="flex h-9 items-center gap-2 border border-red-200 bg-white px-3 text-sm text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            <span>Loeschen</span>
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                ) : (
                  <TableEmpty colSpan={7} label="Noch keine Discord-Einladungen angelegt." />
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="border border-[var(--line-strong)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-3">
          <Server className="size-5 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">Sync-Status</h2>
        </div>
        <dl className="mt-5 grid gap-3 text-sm">
          <DetailRow label="Live-Signal" value={sync.lastFullSync} />
          <DetailRow label="Signal-Alter" value={sync.liveSignalAge} />
          <DetailRow label="Fehler" value={formatNumber(sync.errorCount)} />
          <DetailRow label="Manueller Sync" value={sync.manualSync} />
          <DetailRow label="Bot" value={sync.botState} />
          <DetailRow
            label="Voice live"
            value={formatNumber(sync.liveVoiceSessions)}
          />
          <DetailRow
            label="Auftraege"
            value={formatNumber(sync.moderationQueueSize)}
          />
        </dl>
      </aside>
    </div>
  );
}

function PatchNotesLayer({ onClose }: { onClose: () => void }) {
  const latestPatchVersion = patchNotes[0]?.version ?? "-";

  return (
    <div
      aria-modal="true"
      className="temporary-design-overlay-layer fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      role="dialog"
    >
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col border border-[var(--line-strong)] bg-[var(--surface)] shadow-[10px_10px_0_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line-strong)] bg-[var(--surface-muted)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase">Patchnotes</p>
            <p className="truncate text-xs text-neutral-600">
              Aenderungen an Schland DB - aktuelle Version {latestPatchVersion}
            </p>
          </div>
          <button
            type="button"
            title="Patchnotes schliessen"
            onClick={onClose}
            className="flex h-8 items-center gap-2 border border-[var(--line)] bg-white px-2 text-xs font-medium text-neutral-700"
          >
            <XCircle className="size-4" aria-hidden="true" />
            <span>Schliessen</span>
          </button>
        </div>

        <div className="grid gap-3 overflow-y-auto p-4">
          {patchNotes.length > 0 ? patchNotes.map((note) => (
            <article
              key={note.id}
              className="border border-[var(--line)] bg-white"
            >
              <div className="flex flex-col gap-2 border-b border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold">{note.title}</h2>
                  <p className="text-xs text-neutral-600">
                    {note.date} {"-"} Version {note.version}
                  </p>
                </div>
                <span
                  className={[
                    "w-fit border px-2 py-1 text-xs font-bold uppercase",
                    getPatchNoteTypeClass(note.type),
                  ].join(" ")}
                >
                  {getPatchNoteTypeLabel(note.type)}
                </span>
              </div>
              <ul className="grid gap-2 p-3 text-sm text-neutral-800">
                {note.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-[var(--accent)]"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          )) : (
            <div className="border border-[var(--line)] bg-white p-4 text-sm text-neutral-600">
              Noch keine Patchnotes vorhanden.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LockdownOverlay({ lockdown }: { lockdown: LockdownStatus }) {
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    if (!soundEnabled) {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.value = 420;
    lfo.frequency.value = 0.9;
    lfoGain.gain.value = 220;
    gain.gain.value = 0.035;

    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    lfo.start();

    return () => {
      oscillator.stop();
      lfo.stop();
      context.close();
    };
  }, [soundEnabled]);

  return (
    <div className="temporary-design-overlay-layer pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
      <div className="w-[min(620px,100%)] overflow-hidden rounded-md border border-red-500/80 bg-[#140202]/95 text-white shadow-[0_18px_70px_rgba(127,29,29,0.45)] backdrop-blur">
        <div className="lockdown-scan h-1 bg-red-500" />
        <div className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <div className="flex size-12 items-center justify-center rounded-md border border-red-500/70 bg-red-950 lockdown-pulse">
            <Siren className="size-6 text-red-200" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs font-black uppercase tracking-[0.22em] text-red-200">
              Lockdown aktiv
            </p>
            <p className="mt-1 truncate text-sm text-red-50">
              Webzugang nur mit Notfallschluessel. Discord:{" "}
              <span className="font-mono">{lockdown.botStatus || "pending"}</span>
            </p>
            {lockdown.reason ? (
              <p className="mt-1 truncate text-xs text-red-200">
                Grund: {lockdown.reason}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSoundEnabled((value) => !value)}
            className="pointer-events-auto flex h-9 items-center justify-center gap-2 rounded-md border border-red-300/70 bg-red-700 px-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-red-600"
          >
            <Flame className="size-4" aria-hidden="true" />
            <span>{soundEnabled ? "Sound aus" : "Sound"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  authStatus,
  environmentStatus,
  lockdown,
  members,
  mfaReady,
  previewKey,
  setPreviewKey,
  temporaryDesigns,
}: {
  authStatus: AuthStatus;
  environmentStatus: EnvironmentStatus;
  lockdown: LockdownStatus;
  members: WorkspaceMember[];
  mfaReady: boolean;
  previewKey: string;
  setPreviewKey: (key: string) => void;
  temporaryDesigns: TemporaryDesignState;
}) {
  const templateOptions = temporaryDesigns.templates;
  const firstEditableTemplate =
    templateOptions.find((template) => template.key !== "default") ?? templateOptions[0];
  const [previewDraftKey, setPreviewDraftKey] = useState(
    previewKey || temporaryDesigns.activeDesign.key,
  );
  const [editKey, setEditKey] = useState(
    temporaryDesigns.settings.manualTemplateKey || firstEditableTemplate?.key || "",
  );
  const activeTemplate =
    templateOptions.find((template) => template.key === temporaryDesigns.activeDesign.key) ??
    templateOptions.find((template) => template.key === "default") ??
    templateOptions[0];
  const previewDraftTemplate =
    templateOptions.find((template) => template.key === previewDraftKey) ??
    activeTemplate ??
    templateOptions[0];
  const renderedPreviewTemplate =
    templateOptions.find((template) => template.key === previewKey) ??
    activeTemplate ??
    templateOptions[0];
  const editableTemplate =
    templateOptions.find((template) => template.key === editKey) ??
    firstEditableTemplate ??
    templateOptions[0];
  const canPersistTemporaryDesign = mfaReady && temporaryDesigns.storageReady;
  const renderedPreviewStyle = renderedPreviewTemplate
    ? ({
        "--accent": renderedPreviewTemplate.theme.accentColor,
        "--accent-soft": renderedPreviewTemplate.theme.accentSoftColor,
        "--accent-strong": renderedPreviewTemplate.theme.accentStrongColor,
        "--background": renderedPreviewTemplate.theme.backgroundColor,
        "--button": renderedPreviewTemplate.theme.buttonColor,
      } as CSSProperties)
    : undefined;
  const renderedPreviewDecorationClass = getTemporaryDesignDecorationClass(
    renderedPreviewTemplate?.theme.decoration,
  );
  const renderedPreviewHeaderStyleClass = getTemporaryDesignHeaderStyleClass(
    renderedPreviewTemplate?.theme.headerStyle,
  );
  const previewAtmosphereElementCount =
    getTemporaryDesignAtmosphereElementCount(
      renderedPreviewTemplate?.theme.backgroundClass,
      "preview",
    );

  const lockdownRecipients = members
    .filter((member) => member.discordId && member.discordOnServer)
    .sort((left, right) => {
      const leftName = left.displayName || left.discordName || left.name;
      const rightName = right.displayName || right.discordName || right.name;

      return leftName.localeCompare(rightName, "de");
    });

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] xl:col-span-2">
        <SectionHeader
          icon={Sparkles}
          title="Designs"
          action={
            <span
              className={[
                "rounded-md px-2 py-1 text-xs font-bold uppercase",
                temporaryDesigns.storageReady
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "bg-amber-100 text-amber-900",
              ].join(" ")}
            >
              {temporaryDesigns.storageReady ? "Supabase aktiv" : "Migration fehlt"}
            </span>
          }
        />
        <div className="grid gap-4 border-t border-[var(--line)] p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <StatusTile
              label="Aktiv"
              value={temporaryDesigns.activeDesign.name}
              detail={mapTemporaryDesignSource(temporaryDesigns.activeDesign.source)}
            />
            <StatusTile
              label="Vorschau"
              value={previewKey ? renderedPreviewTemplate?.name ?? "-" : "Aus"}
              detail={previewKey ? "lokal sichtbar" : "Live-Design"}
            />
            <StatusTile
              label="Supabase"
              value={temporaryDesigns.storageReady ? "Verbunden" : "Nicht bereit"}
              detail={temporaryDesigns.storageMessage}
              tone={temporaryDesigns.storageReady ? "default" : "warning"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <form
              action={saveTemporaryDesignSettingsAction}
              className="grid gap-4 rounded-md border border-[var(--line)] bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase">Aktivierung</p>
                  <p className="text-xs text-neutral-500">
                    {temporaryDesigns.storageReady
                      ? "gespeichert in Supabase"
                      : temporaryDesigns.storageMessage}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={!canPersistTemporaryDesign}
                  className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Save className="size-4" aria-hidden="true" />
                  <span>Speichern</span>
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex min-h-10 items-center gap-2 border border-[var(--line)] px-3 text-sm font-medium">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={temporaryDesigns.settings.enabled}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span>Designs aktiv</span>
                </label>
                <label className="flex min-h-10 items-center gap-2 border border-[var(--line)] px-3 text-sm font-medium">
                  <input
                    name="automaticEnabled"
                    type="checkbox"
                    defaultChecked={temporaryDesigns.settings.automaticEnabled}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span>Automatik</span>
                </label>
                <label className="flex min-h-10 items-center gap-2 border border-[var(--line)] px-3 text-sm font-medium">
                  <input
                    name="manualEnabled"
                    type="checkbox"
                    defaultChecked={temporaryDesigns.settings.manualEnabled}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span>Manuell</span>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px_120px]">
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Manuelles Design
                  </span>
                  <select
                    name="manualTemplateKey"
                    defaultValue={temporaryDesigns.settings.manualTemplateKey}
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Kein manuelles Design</option>
                    {templateOptions.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Start
                  </span>
                  <input
                    name="manualStartDate"
                    type="date"
                    defaultValue={temporaryDesigns.settings.manualStartDate}
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Ende
                  </span>
                  <input
                    name="manualEndDate"
                    type="date"
                    defaultValue={temporaryDesigns.settings.manualEndDate}
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Prioritaet
                  </span>
                  <input
                    name="manualPriority"
                    type="number"
                    min={0}
                    max={999}
                    defaultValue={temporaryDesigns.settings.manualPriority}
                    className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>
            </form>

            <div className="grid gap-3 rounded-md border border-[var(--line)] bg-white p-3">
              <div
                className={[
                  "temporary-design-preview grid min-h-[190px] content-between gap-3 border border-[var(--line-strong)] bg-[var(--background)] p-3",
                  renderedPreviewTemplate?.theme.backgroundClass ?? "theme-default",
                  `temporary-design-preview-${renderedPreviewHeaderStyleClass}`,
                ].join(" ")}
                style={renderedPreviewStyle}
              >
                <span className="temporary-design-preview-atmosphere" aria-hidden="true">
                  {Array.from({ length: previewAtmosphereElementCount }, (_, index) => (
                    <span key={`temporary-design-preview-atmosphere-${index}`} />
                  ))}
                </span>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`temporary-design-emblem temporary-design-emblem-${renderedPreviewDecorationClass}`}
                      aria-hidden="true"
                    >
                      <span className="temporary-design-emblem-mark" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-[var(--accent-strong)]">
                        Vorschau
                      </p>
                      <p className="mt-1 truncate text-xl font-black">
                        {renderedPreviewTemplate?.name ?? "Standard"}
                      </p>
                      <p className="text-sm text-neutral-700">
                        {formatTemporaryDesignPeriod(renderedPreviewTemplate)}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-bold uppercase text-white">
                    {renderedPreviewTemplate?.theme.bannerLabel || "Theme"}
                  </span>
                </div>
                <div className="grid gap-2">
                  <div className="temporary-design-preview-banner-line h-3 bg-[var(--accent)]" />
                  <div className="grid grid-cols-3 gap-2">
                    <span className="h-8 border border-[var(--line)] bg-[var(--surface)]" />
                    <span className="h-8 border border-[var(--line)] bg-[var(--accent-soft)]" />
                    <span className="h-8 border border-[var(--line)] bg-[var(--accent-strong)]" />
                  </div>
                  <span className="temporary-design-preview-button flex h-9 items-center justify-center border border-[var(--line-strong)] px-3 text-xs font-black uppercase text-white">
                    Aktion
                  </span>
                </div>
              </div>

              <div className="grid gap-2">
                <select
                  value={previewDraftKey}
                  onChange={(event) => setPreviewDraftKey(event.target.value)}
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                >
                  {templateOptions.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPreviewKey(previewDraftTemplate?.key ?? "")}
                    className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm font-medium text-white"
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    <span>Vorschau anzeigen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewKey("");
                      setPreviewDraftKey(activeTemplate?.key ?? "");
                    }}
                    className="flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-medium"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    <span>Live anzeigen</span>
                  </button>
                </div>
              </div>

              {renderedPreviewTemplate ? (
                <form action={activateTemporaryDesignTemplateAction}>
                  <input
                    type="hidden"
                    name="templateKey"
                    value={renderedPreviewTemplate.key}
                  />
                  <button
                    type="submit"
                    disabled={!canPersistTemporaryDesign}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-3 text-sm font-bold text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Sparkles className="size-4" aria-hidden="true" />
                    <span>Als aktives Design speichern</span>
                  </button>
                </form>
              ) : null}

              <form action={resetTemporaryDesignSettingsAction}>
                <button
                  type="submit"
                  disabled={!canPersistTemporaryDesign}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  <span>Manuelle Aktivierung entfernen</span>
                </button>
              </form>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="overflow-x-auto rounded-md border border-[var(--line)] bg-white">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Vorlage</th>
                    <th className="px-3 py-2 font-medium">Zeitraum</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {templateOptions.map((template) => (
                    <tr key={template.key} className="border-t border-[var(--line)]">
                      <td className="px-3 py-2">
                        <div className="font-medium">{template.name}</div>
                        <div className="font-mono text-xs text-neutral-500">
                          {template.key}
                        </div>
                      </td>
                      <td className="px-3 py-2">{formatTemporaryDesignPeriod(template)}</td>
                      <td className="px-3 py-2">
                        {template.enabled ? "Aktiv" : "Inaktiv"}
                        {template.manualOnly ? " / manuell" : ""}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewDraftKey(template.key);
                              setPreviewKey(template.key);
                            }}
                            className="h-8 border border-[var(--line)] bg-white px-2 text-xs font-medium"
                          >
                            Vorschau
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditKey(template.key)}
                            className="h-8 border border-[var(--line)] bg-white px-2 text-xs font-medium"
                          >
                            Bearbeiten
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editableTemplate ? (
              <form
                key={editableTemplate.key}
                action={saveTemporaryDesignTemplateAction}
                className="grid gap-3 rounded-md border border-[var(--line)] bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase">Vorlage bearbeiten</p>
                    <p className="font-mono text-xs text-neutral-500">
                      {editableTemplate.key}
                    </p>
                  </div>
                  <select
                    value={editKey}
                    onChange={(event) => setEditKey(event.target.value)}
                    className="h-10 min-w-[220px] rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                  >
                    {templateOptions.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Template-Key
                    </span>
                    <input
                      name="templateKey"
                      defaultValue={editableTemplate.key}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 font-mono text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Name
                    </span>
                    <input
                      name="templateName"
                      defaultValue={editableTemplate.name}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Event
                    </span>
                    <input
                      name="eventName"
                      defaultValue={editableTemplate.eventName}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Prioritaet
                    </span>
                    <input
                      name="priority"
                      type="number"
                      min={0}
                      max={999}
                      defaultValue={editableTemplate.priority}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Start
                    </span>
                    <input
                      name="startDate"
                      placeholder="YYYY-MM-DD oder MM-DD"
                      defaultValue={editableTemplate.startDate}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Ende
                    </span>
                    <input
                      name="endDate"
                      placeholder="YYYY-MM-DD oder MM-DD"
                      defaultValue={editableTemplate.endDate}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Dynamik
                    </span>
                    <select
                      name="dynamicDate"
                      defaultValue={editableTemplate.dynamicDate}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">Keine</option>
                      <option value="easter_sunday">Ostern</option>
                      <option value="christi_himmelfahrt">Christi Himmelfahrt</option>
                      <option value="pfingsten">Pfingsten</option>
                      <option value="black_friday">Black Friday</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Von
                      </span>
                      <input
                        name="startOffsetDays"
                        type="number"
                        defaultValue={editableTemplate.startOffsetDays}
                        className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        Bis
                      </span>
                      <input
                        name="endOffsetDays"
                        type="number"
                        defaultValue={editableTemplate.endOffsetDays}
                        className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  {[
                    ["backgroundColor", "Hintergrund", editableTemplate.theme.backgroundColor],
                    ["accentColor", "Akzent", editableTemplate.theme.accentColor],
                    ["accentSoftColor", "Akzent hell", editableTemplate.theme.accentSoftColor],
                    ["accentStrongColor", "Akzent dunkel", editableTemplate.theme.accentStrongColor],
                    ["buttonColor", "Button", editableTemplate.theme.buttonColor],
                  ].map(([name, label, value]) => (
                    <label key={name} className="grid gap-2">
                      <span className="text-xs font-medium uppercase text-neutral-500">
                        {label}
                      </span>
                      <input
                        name={name}
                        type="color"
                        defaultValue={value}
                        className="h-10 rounded-md border border-[var(--line)] bg-white px-2 py-1"
                      />
                    </label>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      CSS-Klasse
                    </span>
                    <input
                      name="backgroundClass"
                      defaultValue={editableTemplate.theme.backgroundClass}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 font-mono text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Banner
                    </span>
                    <input
                      name="bannerLabel"
                      defaultValue={editableTemplate.theme.bannerLabel}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!canPersistTemporaryDesign}
                    className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Save className="size-4" aria-hidden="true" />
                    <span>Vorlage speichern</span>
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Designmotiv
                    </span>
                    <select
                      name="decoration"
                      defaultValue={editableTemplate.theme.decoration}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    >
                      {temporaryDesignDecorationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-medium uppercase text-neutral-500">
                      Kopfstil
                    </span>
                    <select
                      name="headerStyle"
                      defaultValue={editableTemplate.theme.headerStyle}
                      className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    >
                      {temporaryDesignHeaderStyleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="templateEnabled"
                      type="checkbox"
                      defaultChecked={editableTemplate.enabled}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span>Aktiv</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="manualOnly"
                      type="checkbox"
                      defaultChecked={editableTemplate.manualOnly}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span>Nur manuell</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="recurring"
                      type="checkbox"
                      defaultChecked={editableTemplate.recurring}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span>Jaehrlich</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="bannerEnabled"
                      type="checkbox"
                      defaultChecked={editableTemplate.theme.bannerEnabled}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span>Banner</span>
                  </label>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-red-900/70 bg-[#170606] text-white shadow-[0_12px_40px_rgba(127,29,29,0.22)] xl:col-span-2">
        <SectionHeader
          icon={Siren}
          title="Lockdown"
          action={
            <span
              className={[
                "rounded-md px-2 py-1 text-xs font-bold uppercase",
                lockdown.active
                  ? "bg-red-500 text-white"
                  : "bg-white/10 text-red-100",
              ].join(" ")}
            >
              {lockdown.active ? "Aktiv" : "Bereit"}
            </span>
          }
        />
        <div className="grid gap-4 border-t border-red-950 p-4 lg:grid-cols-[1fr_420px]">
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-md border border-red-900/70 bg-black/20 p-3">
                <p className="text-xs uppercase text-red-200">Status</p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {lockdown.active ? "LOCKDOWN" : "STANDBY"}
                </p>
              </article>
              <article className="rounded-md border border-red-900/70 bg-black/20 p-3">
                <p className="text-xs uppercase text-red-200">Bot</p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {lockdown.botStatus || "idle"}
                </p>
              </article>
              <article className="rounded-md border border-red-900/70 bg-black/20 p-3">
                <p className="text-xs uppercase text-red-200">Ausgeloest</p>
                <p className="mt-1 truncate font-mono text-lg font-bold">
                  {lockdown.activatedByName || "-"}
                </p>
              </article>
            </div>
            <div className="rounded-md border border-red-900/70 bg-black/20 p-3 text-sm text-red-50">
              <p className="font-semibold">Wirkung</p>
              <p className="mt-1 text-red-100">
                Discord sperrt Nicht-Admins auf Kanalebene. In Schland ist der
                Zugang nur mit dem erzeugten Notfallschluessel moeglich.
              </p>
              {lockdown.reason ? (
                <p className="mt-2 text-red-100">Grund: {lockdown.reason}</p>
              ) : null}
              {lockdown.botError ? (
                <p className="mt-2 text-red-200">Bot-Fehler: {lockdown.botError}</p>
              ) : null}
            </div>
          </div>

          {lockdown.active ? (
            <form
              action={deactivateLockdownAction}
              className="grid gap-3 rounded-md border border-red-900/70 bg-black/25 p-3"
            >
              <div className="flex items-center gap-2 text-red-100">
                <Shield className="size-4" aria-hidden="true" />
                <span className="text-sm font-bold uppercase">Lockdown beenden</span>
              </div>
              <input
                name="reason"
                required
                minLength={8}
                placeholder="Grund fuer Entsperrung"
                className="lockdown-input h-10 px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <input
                name="emergencyCode"
                placeholder="Notfallschluessel, falls 2FA blockiert"
                className="lockdown-input h-10 px-3 font-mono text-sm uppercase tracking-[0.18em] outline-none"
                type="password"
              />
              {!mfaReady || !lockdown.canManage ? (
                <p className="text-xs text-red-200/80">
                  Normalweg braucht 2FA und Lockdown-Recht. Im aktiven Lockdown
                  kann der Notfallschluessel das Beenden freigeben.
                </p>
              ) : null}
              <button
                type="submit"
                className="flex h-11 items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-4 text-sm font-black uppercase text-red-800 transition hover:translate-y-[-1px] hover:shadow-[0_0_25px_rgba(255,255,255,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                <span>Entsperren</span>
              </button>
            </form>
          ) : (
            <form
              action={activateLockdownAction}
              className="grid gap-3 rounded-md border border-red-900/70 bg-black/25 p-3"
            >
              <div className="flex items-center gap-2 text-red-100">
                <TriangleAlert className="size-4" aria-hidden="true" />
                <span className="text-sm font-black uppercase">Roter Knopf</span>
              </div>
              <input
                name="reason"
                required
                minLength={8}
                placeholder="Grund fuer Lockdown"
                className="lockdown-input h-10 px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="grid gap-1">
                <p className="text-xs font-bold uppercase text-red-200">
                  Notfallschluessel per DM an
                </p>
                <details className="lockdown-dropdown">
                  <summary className="flex min-h-10 cursor-pointer items-center justify-between px-3 text-sm font-bold text-white">
                    <span>Personen auswaehlen</span>
                    <span className="font-mono text-xs text-red-200">
                      {lockdownRecipients.length}
                    </span>
                  </summary>
                  <div className="max-h-56 overflow-auto border-t border-red-900/70 p-2">
                    {lockdownRecipients.length > 0 ? (
                      lockdownRecipients.map((member) => {
                        const label =
                          member.displayName || member.discordName || member.name;

                        return (
                          <label
                            key={member.id}
                            className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm text-red-50 hover:bg-red-950/70"
                          >
                            <input
                              type="checkbox"
                              name="recipientDiscordIds"
                              value={member.discordId}
                              className="size-4 accent-red-600"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-bold">{label}</span>
                              <span className="block truncate font-mono text-xs text-red-200">
                                {member.discordName || member.discordId}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="px-2 py-3 text-sm text-red-200">
                        Keine Discord-Mitglieder mit verknuepfter ID gefunden.
                      </p>
                    )}
                  </div>
                </details>
                <span className="text-xs text-red-200/80">
                  Ausgewaehlte Personen bekommen den Code per DM. losoverdrive
                  bleibt als Sicherheits-Empfaenger hinterlegt.
                </span>
              </div>
              <input name="recipientUsernames" type="hidden" value="losoverdrive" />
              <input
                name="importantChannelIds"
                placeholder="Wichtige Channel-IDs, optional"
                className="lockdown-input h-10 px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              {!mfaReady || !lockdown.canManage ? (
                <p className="text-xs text-red-200/80">
                  Aktivieren wird serverseitig mit 2FA und Lockdown-Recht
                  geprueft.
                </p>
              ) : null}
              <button
                type="submit"
                className="group relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-md border border-red-300 bg-red-700 px-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:translate-y-[-1px] hover:bg-red-600 hover:shadow-[0_0_35px_rgba(248,113,113,0.6)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="absolute inset-0 translate-x-[-110%] bg-gradient-to-r from-transparent via-white/30 to-transparent transition duration-700 group-hover:translate-x-[110%]" />
                <Siren className="size-5" aria-hidden="true" />
                <span>Lockdown aktivieren</span>
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Settings} title="Systemstatus" />
        <div className="grid gap-3 border-t border-[var(--line)] p-4">
          <StatusLine
            active={environmentStatus.supabaseUrl}
            label="NEXT_PUBLIC_SUPABASE_URL"
          />
          <StatusLine
            active={environmentStatus.supabasePublishableKey}
            label="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
          />
          <StatusLine
            active={environmentStatus.supabaseServiceRole}
            label="SUPABASE_SERVICE_ROLE_KEY"
          />
          <StatusLine active={environmentStatus.vercel} label="Vercel Runtime" />
          <StatusLine active={authStatus.signedIn} label="Angemeldet" />
          <StatusLine
            active={authStatus.mfaLevel === "aal2"}
            label={
              authStatus.mfaRequired === false
                ? "2FA-Pflicht deaktiviert"
                : "2FA AAL2"
            }
          />
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader
          icon={Lock}
          title="Sicherheitsregeln"
          action={
            <a
              href="/security"
              className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              <span>2FA</span>
            </a>
          }
        />
        <div className="grid gap-3 border-t border-[var(--line)] p-4 text-sm">
          {[
            "Persoenliche Benutzerkonten",
            "Flexible Rollen und Rechte",
            "2FA-Pflicht standardmaessig aktiv",
            "Zugriffsgrund vor Aktenansicht",
            "Detailprotokoll nur fuer Mitgliederakten",
          ].map((rule) => (
            <div key={rule} className="flex items-center gap-2">
              <CheckCircle2
                className="size-4 text-[var(--accent)]"
                aria-hidden="true"
              />
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Bot} title="Discord-Betrieb" />
        <div className="grid gap-3 border-t border-[var(--line)] p-4 text-sm">
          <StatusLine
            active={environmentStatus.discordBotToken}
            label="Bot-Token"
          />
          <StatusLine
            active={environmentStatus.discordGuildId}
            label="Server-ID"
          />
          <StatusLine
            active={environmentStatus.discordInviteChannelId}
            label="Invite-Kanal"
          />
          <StatusLine active={environmentStatus.cronSecret} label="Cron-Schutz" />
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Folder} title="Google Drive" />
        <div className="grid gap-3 border-t border-[var(--line)] p-4 text-sm">
          <StatusLine
            active={environmentStatus.googleDriveClientEmail}
            label="Service-Account E-Mail"
          />
          <StatusLine
            active={environmentStatus.googleDrivePrivateKey}
            label="Service-Account Private Key"
          />
          <StatusLine
            active={environmentStatus.googleDriveRootFolderId}
            label="Root-Ordner konfiguriert"
          />
          <StatusLine
            active={environmentStatus.googleDocsTemplateId}
            label="Docs-Vorlage konfiguriert"
          />
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Bot} title="KI-Auswertung" />
        <div className="grid gap-3 border-t border-[var(--line)] p-4 text-sm">
          <StatusLine active={environmentStatus.openAiApiKey} label="OPENAI_API_KEY" />
          <StatusLine
            active={environmentStatus.openAiModel}
            label={
              environmentStatus.openAiModelConfigured
                ? `OPENAI_MODEL ${environmentStatus.openAiModelName}`
                : `OPENAI_MODEL Standard ${environmentStatus.openAiModelName}`
            }
          />
          <StatusLine active label="Regelwerke serverseitig" />
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Database} title="Datenhaltung" />
        <div className="grid gap-3 border-t border-[var(--line)] p-4 text-sm">
          <StatusLine active label="Mitgliederakten per Discord-ID" />
          <StatusLine active label="Bots ausgeschlossen" />
          <StatusLine active label="Moderationsregister dauerhaft" />
          <StatusLine active label="Einladungen per Discord-DM" />
          <StatusLine active label="Dateien per Drive-ID verknuepft" />
          <StatusLine active label="Drive-Loeschungen nur als Konflikt markiert" />
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  action,
  icon: Icon,
  title,
}: {
  action?: React.ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <h2 className="truncate font-semibold">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function StatusTile({
  detail,
  label,
  tone = "default",
  value,
}: {
  detail: string;
  label: string;
  tone?: "default" | "warning";
  value: string;
}) {
  return (
    <article
      className={[
        "border p-3",
        tone === "warning"
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-[var(--line)] bg-white",
      ].join(" ")}
    >
      <p className="text-xs font-medium uppercase text-neutral-500">{label}</p>
      <p className="mt-1 truncate text-lg font-black">{value || "-"}</p>
      <p className="mt-1 truncate text-xs text-neutral-600">{detail || "-"}</p>
    </article>
  );
}

function StatusLine({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate">{label}</span>
      {active ? (
        <CheckCircle2 className="size-4 text-[var(--accent)]" aria-hidden="true" />
      ) : (
        <XCircle className="size-4 text-[var(--danger)]" aria-hidden="true" />
      )}
    </div>
  );
}

function mapTemporaryDesignSource(source: ActiveTemporaryDesign["source"]) {
  const labels: Record<ActiveTemporaryDesign["source"], string> = {
    automatic: "Automatik",
    default: "Standard",
    manual: "Manuell",
  };

  return labels[source];
}

const temporaryDesignDecorationOptions = [
  { label: "Standard", value: "" },
  { label: "Blumen", value: "floral" },
  { label: "Abzeichen", value: "badge" },
  { label: "Spielfeld", value: "pitch" },
  { label: "Sterne", value: "stars" },
  { label: "Eier", value: "eggs" },
  { label: "Funken", value: "spark" },
  { label: "Mond", value: "moon" },
  { label: "Herz", value: "heart" },
  { label: "Kontrast", value: "contrast" },
] as const;

const temporaryDesignHeaderStyleOptions = [
  { label: "Standard", value: "default" },
  { label: "Weich", value: "soft" },
  { label: "Klar", value: "clear" },
  { label: "Sport", value: "sport" },
  { label: "Stadion", value: "stadium" },
  { label: "Festlich", value: "festive" },
  { label: "Fruehling", value: "spring" },
  { label: "Feier", value: "celebration" },
  { label: "Saisonal", value: "seasonal" },
  { label: "Kontrast", value: "contrast" },
] as const;

function getTemporaryDesignDecorationClass(value?: string | null) {
  const allowed = new Set<string>(
    temporaryDesignDecorationOptions
      .map((option) => option.value)
      .filter(Boolean),
  );
  const token = value ?? "";

  return allowed.has(token) ? token : "default";
}

function getTemporaryDesignHeaderStyleClass(value?: string | null) {
  const allowed = new Set<string>(
    temporaryDesignHeaderStyleOptions
      .map((option) => option.value)
      .filter(Boolean),
  );
  const token = value ?? "";

  return allowed.has(token) ? token : "default";
}

function formatTemporaryDesignPeriod(template?: TemporaryDesignTemplate | null) {
  if (!template) {
    return "-";
  }

  if (template.dynamicDate) {
    return `${mapTemporaryDesignDynamicDate(template.dynamicDate)} ${
      template.startOffsetDays || template.endOffsetDays
        ? `(${template.startOffsetDays}/${template.endOffsetDays})`
        : ""
    }`.trim();
  }

  if (template.startDate || template.endDate) {
    return `${template.startDate || "-"} - ${template.endDate || "-"}`;
  }

  return template.manualOnly ? "manuell" : "immer";
}

function mapTemporaryDesignDynamicDate(value: string) {
  const labels: Record<string, string> = {
    black_friday: "Black Friday",
    christi_himmelfahrt: "Christi Himmelfahrt",
    easter_sunday: "Ostern",
    pfingsten: "Pfingsten",
  };

  return labels[value] ?? value;
}

function EnvironmentPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={[
        "flex h-9 items-center gap-2 rounded-md border px-3 text-sm",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "border-[var(--line)] bg-[var(--surface)] text-neutral-500",
      ].join(" ")}
    >
      {active ? (
        <CheckCircle2 className="size-4" aria-hidden="true" />
      ) : (
        <XCircle className="size-4" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

function SessionTimerPill({
  remainingSeconds,
}: {
  remainingSeconds: number;
}) {
  const isCritical = remainingSeconds <= 60;
  const isWarning = remainingSeconds <= 5 * 60;

  return (
    <span
      className={[
        "flex h-9 items-center gap-2 rounded-md border px-3 text-sm",
        isCritical
          ? "border-red-200 bg-red-50 text-[var(--danger)]"
          : isWarning
            ? "border-amber-300 bg-[#fff4d6] text-[var(--warning)]"
            : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
      ].join(" ")}
      title="Restzeit der Anmeldung"
    >
      <Clock className="size-4" aria-hidden="true" />
      <span>{formatSessionRemaining(remainingSeconds)}</span>
    </span>
  );
}

function Notice({ notice }: { notice: SetupNotice }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    warning: "border-amber-200 bg-[#fff4d6] text-amber-900",
  };

  return (
    <div className={`rounded-lg border p-3 text-sm ${styles[notice.tone]}`}>
      {notice.text}
    </div>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="col-span-full rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-neutral-600">
      {label}
    </div>
  );
}

function TableEmpty({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr className="border-t border-[var(--line)]">
      <td className="px-4 py-6 text-sm text-neutral-500" colSpan={colSpan}>
        {label}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: MemberStatusLabel }) {
  const styles = {
    Aktiv: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    Pruefung: "bg-[#fff4d6] text-[var(--warning)]",
    Archiv: "bg-[var(--surface-muted)] text-neutral-600",
  };

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function getInviteStatusClass(status: string) {
  if (status === "pending" || status === "created") {
    return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }

  if (status === "failed" || status === "cancelled") {
    return "bg-red-50 text-[var(--danger)]";
  }

  return "bg-[var(--surface-muted)] text-neutral-600";
}

function mapInviteDmStatus(status: string) {
  const labels: Record<string, string> = {
    failed: "Fehler",
    pending: "Offen",
    sent: "Gesendet",
    skipped: "Nicht gesendet",
  };

  return labels[status] ?? status;
}

function getInviteDmStatusClass(status: string) {
  if (status === "sent") {
    return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }

  if (status === "failed") {
    return "bg-red-50 text-[var(--danger)]";
  }

  if (status === "pending") {
    return "bg-[#fff4d6] text-[var(--warning)]";
  }

  if (status === "running") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-[var(--surface-muted)] text-neutral-600";
}

function getModerationTypeClass(eventType: string) {
  if (eventType === "warn") {
    return "bg-[var(--surface-muted)] text-neutral-600";
  }

  if (eventType === "ban") {
    return "bg-red-50 text-[var(--danger)]";
  }

  if (eventType === "timeout") {
    return "bg-[#fff4d6] text-[var(--warning)]";
  }

  return "bg-[var(--surface-muted)] text-neutral-600";
}

function getModerationStatusClass(status: string) {
  if (status === "active") {
    return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }

  if (status === "failed") {
    return "bg-red-50 text-[var(--danger)]";
  }

  return "bg-[var(--surface-muted)] text-neutral-600";
}

function mapAdviceActionLabel(action: string) {
  const labels: Record<string, string> = {
    ban: "Ban",
    kick: "Kick",
    manual_review: "Manuelle Pruefung",
    no_action: "Keine Aktion",
    warn: "Warn",
  };

  return labels[action] ?? (action || "-");
}

function getAdviceActionClass(action: string) {
  if (action === "ban" || action === "kick") {
    return "bg-red-50 text-[var(--danger)]";
  }

  if (action === "warn") {
    return "bg-[#fff4d6] text-[var(--warning)]";
  }

  if (action === "manual_review") {
    return "bg-blue-100 text-blue-800";
  }

  if (action === "no_action") {
    return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }

  return "bg-[var(--surface-muted)] text-neutral-600";
}

function getAdviceStatusClass(status: string) {
  if (status === "executed" || status === "advice_ready" || status === "saved") {
    return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }

  if (status === "failed" || status === "cancelled") {
    return "bg-red-50 text-[var(--danger)]";
  }

  if (status === "queued" || status === "analyzing") {
    return "bg-[#fff4d6] text-[var(--warning)]";
  }

  return "bg-[var(--surface-muted)] text-neutral-600";
}

function formatAdviceConfidence(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

function mapEvidenceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    file: "Datei",
    message_link: "Message-Link",
    note: "Notiz",
    other: "Nachweis",
    screenshot: "Screenshot",
  };

  return labels[type] ?? type;
}

function mapAdviceLogAction(action: string) {
  const labels: Record<string, string> = {
    alte_sanktionen_abgefragt: "Alte Sanktionen abgefragt",
    beleg_hinzugefuegt: "Beleg hinzugefuegt",
    beratung_erstellt: "Beratung erstellt",
    beratung_gespeichert: "Beratung gespeichert",
    bot_befehl_erstellt: "Bot-Befehl erstellt",
    bot_befehl_laeuft: "Bot-Befehl laeuft",
    bot_erfolgreich_ausgefuehrt: "Bot erfolgreich ausgefuehrt",
    bot_fehlgeschlagen: "Bot fehlgeschlagen",
    belege_unlesbar: "Belege nicht vollstaendig lesbar",
    ki_auswertung_abgeschlossen: "KI-Auswertung abgeschlossen",
    ki_auswertung_gestartet: "KI-Auswertung gestartet",
    offizielles_dokument_erstellt: "Offizielles Dokument erstellt",
    offizielles_dokument_fehler: "Offizielles Dokument fehlgeschlagen",
    rechtsgrundlagen_geladen: "Rechtsgrundlagen geladen",
    template_placeholders_missing: "Vorlagen-Platzhalter fehlen",
    titel_geaendert: "Titel geaendert",
  };

  return labels[action] ?? action;
}

function readAdviceText(source: unknown, key: string) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return "";
  }

  return String((source as Record<string, unknown>)[key] ?? "").trim();
}

function readAdviceStringList(source: unknown, key: string) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return [];
  }

  const value = (source as Record<string, unknown>)[key];

  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function readAdviceBoolean(source: unknown, key: string) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return false;
  }

  return (source as Record<string, unknown>)[key] === true;
}

function readAdviceObjectList(source: unknown, key: string) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return [];
  }

  const value = (source as Record<string, unknown>)[key];

  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function readSnapshotRows(source: Record<string, unknown>) {
  const rows = source.rows;

  return Array.isArray(rows)
    ? rows.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null && !Array.isArray(row),
      )
    : [];
}

function readSnapshotDocuments(source: Record<string, unknown>) {
  const documents = source.documents;

  return Array.isArray(documents)
    ? documents.filter(
        (document): document is Record<string, unknown> =>
          typeof document === "object" &&
          document !== null &&
          !Array.isArray(document),
      )
    : [];
}

function getRepresentationStatusClass(status: string) {
  if (status === "active") {
    return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }

  if (status === "failed") {
    return "bg-red-50 text-[var(--danger)]";
  }

  if (status === "pending" || status === "assigning" || status === "ending") {
    return "bg-[#fff4d6] text-[var(--warning)]";
  }

  return "bg-[var(--surface-muted)] text-neutral-600";
}

function getEditableModerationStatus(status: string) {
  return ["active", "expired", "failed", "lifted", "recorded"].includes(status)
    ? status
    : "recorded";
}

function buildWorkspaceNotifications({
  authStatus,
  environmentStatus,
  mfaReady,
  setupNotice,
  workspaceData,
}: {
  authStatus: AuthStatus;
  environmentStatus: EnvironmentStatus;
  mfaReady: boolean;
  setupNotice?: SetupNotice;
  workspaceData: WorkspaceData;
}) {
  const notifications: WorkspaceNotification[] = [];

  if (setupNotice && setupNotice.tone !== "success") {
    notifications.push({
      detail: setupNotice.text,
      id: `setup-${setupNotice.tone}-${setupNotice.text}`,
      section: "dashboard",
      title: setupNotice.tone === "error" ? "Aktion fehlgeschlagen" : "Hinweis",
      tone: setupNotice.tone,
    });
  }

  if (workspaceData.warning) {
    notifications.push({
      detail: workspaceData.warning,
      id: `workspace-warning-${workspaceData.warning}`,
      section: "settings",
      title: "Datenhinweis",
      tone: "warning",
    });
  }

  if (authStatus.signedIn && !mfaReady) {
    notifications.push({
      detail: "Sensible Aktionen sind blockiert, bis die Sitzung mit 2FA freigeschaltet ist.",
      id: "mfa-open",
      section: "settings",
      title: "2FA offen",
      tone: "warning",
    });
  }

  const missingEnvironment = [
    ["Supabase URL", environmentStatus.supabaseUrl],
    ["Supabase Key", environmentStatus.supabasePublishableKey],
    ["Supabase Service", environmentStatus.supabaseServiceRole],
    ["Bot-Token", environmentStatus.discordBotToken],
    ["Bot-Sync", environmentStatus.discordBotSyncToken],
    ["Discord Server", environmentStatus.discordGuildId],
    [
      "Google Drive Service",
      environmentStatus.googleDriveClientEmail && environmentStatus.googleDrivePrivateKey,
    ],
    ["OpenAI API", environmentStatus.openAiApiKey],
  ].filter(([, active]) => !active);

  if (missingEnvironment.length > 0) {
    notifications.push({
      detail: `${formatNumber(missingEnvironment.length)} Einstellung(en) fehlen.`,
      id: `env-missing-${missingEnvironment.length}`,
      section: "settings",
      title: "Umgebung unvollstaendig",
      tone: "error",
    });
  }

  if (!workspaceData.driveSync.configured) {
    notifications.push({
      detail:
        "Service-Account fehlt oder ist nicht vollstaendig. Uploads bleiben sicher gespeichert und werden nachgezogen.",
      id: "drive-config-missing",
      section: "files",
      title: "Google Drive nicht bereit",
      tone: "warning",
    });
  }

  if (workspaceData.driveSync.conflictCount > 0) {
    notifications.push({
      detail: `${formatNumber(workspaceData.driveSync.conflictCount)} offene Drive-Konflikt(e) muessen geprueft werden.`,
      id: `drive-conflicts-${workspaceData.driveSync.conflictCount}`,
      section: "files",
      title: "Drive-Konflikte",
      tone: "warning",
    });
  }

  if (workspaceData.driveSync.latestStatus === "running") {
    notifications.push({
      detail: "Ein Google-Drive-Sync laeuft bereits. Weitere Starts werden sauber uebersprungen.",
      id: "drive-sync-running",
      section: "files",
      title: "Drive-Sync laeuft",
      tone: "info",
    });
  }

  if (!workspaceData.sync.liveSignalFresh) {
    notifications.push({
      detail: `Letztes Signal: ${workspaceData.sync.lastFullSync}.`,
      id: `live-signal-${workspaceData.sync.lastFullSync}`,
      section: "sync",
      title: "Live-Signal alt",
      tone: "error",
    });
  }

  if (workspaceData.sync.errorCount > 0) {
    notifications.push({
      detail: `${formatNumber(workspaceData.sync.errorCount)} Fehler im Sync-Status.`,
      id: `sync-errors-${workspaceData.sync.errorCount}-${workspaceData.sync.lastFullSync}`,
      section: "sync",
      title: "Sync meldet Fehler",
      tone: "error",
    });
  }

  if (!workspaceData.sync.memberCoverageComplete) {
    const missing =
      workspaceData.sync.memberMissingEstimate !== null
        ? `${formatNumber(workspaceData.sync.memberMissingEstimate)} fehlen`
        : "Abgleich pruefen";

    notifications.push({
      detail: `Discord-Mitglieder sind noch nicht vollstaendig erfasst: ${missing}.`,
      id: `member-coverage-${workspaceData.sync.memberScanned}-${workspaceData.sync.memberMissingEstimate ?? "unknown"}`,
      section: "members",
      title: "Mitglieder-Sync unvollstaendig",
      tone: "warning",
    });
  }

  if (workspaceData.sync.moderationQueueSize > 0) {
    notifications.push({
      detail: `${formatNumber(workspaceData.sync.moderationQueueSize)} Bot-Auftrag(e) warten noch.`,
      id: `moderation-queue-${workspaceData.sync.moderationQueueSize}`,
      section: "moderation",
      title: "Moderation wartet",
      tone: "info",
    });
  }

  if (workspaceData.sync.representationQueueSize > 0) {
    notifications.push({
      detail: `${formatNumber(workspaceData.sync.representationQueueSize)} Rollen-Auftrag(e) warten noch.`,
      id: `representation-queue-${workspaceData.sync.representationQueueSize}`,
      section: "representation",
      title: "Amtsvertretung wartet",
      tone: "info",
    });
  }

  const failedRepresentations = workspaceData.absences.flatMap((absence) =>
    absence.representations.filter(
      (representation) => representation.status === "failed" || Boolean(representation.botError),
    ),
  );

  if (failedRepresentations.length > 0) {
    notifications.push({
      detail: `${formatNumber(failedRepresentations.length)} Vertretungsauftrag(e) brauchen Pruefung.`,
      id: `representation-failed-${failedRepresentations.length}`,
      section: "representation",
      title: "Amtsvertretung Fehler",
      tone: "error",
    });
  }

  const failedModerationEvents = workspaceData.moderationEvents.filter(
    (event) => event.status === "failed" || Boolean(event.commandError),
  );

  if (failedModerationEvents.length > 0) {
    notifications.push({
      detail: `${formatNumber(failedModerationEvents.length)} Moderationsereignis(se) brauchen Pruefung.`,
      id: `moderation-failed-${failedModerationEvents.length}`,
      section: "moderation",
      title: "Moderationsfehler",
      tone: "error",
    });
  }

  const failedInvites = workspaceData.discordInvites.filter(
    (invite) =>
      invite.status === "failed" ||
      invite.dmStatus === "failed" ||
      Boolean(invite.botError) ||
      Boolean(invite.dmError),
  );

  if (failedInvites.length > 0) {
    notifications.push({
      detail: `${formatNumber(failedInvites.length)} Einladung(en) haben einen Bot- oder DM-Fehler.`,
      id: `invite-failed-${failedInvites.length}`,
      section: "sync",
      title: "Einladung fehlgeschlagen",
      tone: "error",
    });
  }

  const pendingInvites = workspaceData.discordInvites.filter(
    (invite) =>
      invite.status === "pending" ||
      invite.dmStatus === "pending" ||
      invite.dmStatus === "running",
  );

  if (pendingInvites.length > 0) {
    notifications.push({
      detail: `${formatNumber(pendingInvites.length)} Einladung(en) sind noch offen.`,
      id: `invite-pending-${pendingInvites.length}`,
      section: "sync",
      title: "Einladungen offen",
      tone: "info",
    });
  }

  return notifications;
}

function getNotificationDotClass(tone: WorkspaceNotification["tone"]) {
  if (tone === "error") {
    return "bg-[var(--danger)]";
  }

  if (tone === "warning") {
    return "bg-[var(--warning)]";
  }

  return "bg-[var(--accent)]";
}

function getPatchNoteTypeClass(type: "feature" | "fix" | "system") {
  if (type === "feature") {
    return "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }

  if (type === "fix") {
    return "border-amber-300 bg-[#fff4d6] text-amber-950";
  }

  return "border-[var(--line)] bg-white text-neutral-700";
}

function getPatchNoteTypeLabel(type: "feature" | "fix" | "system") {
  if (type === "feature") {
    return "Neu";
  }

  if (type === "fix") {
    return "Fix";
  }

  return "System";
}

function MemberProfileImage({
  member,
  profileImageFile,
}: {
  member: WorkspaceMember;
  profileImageFile: WorkspaceMember["linkedFiles"][number] | null;
}) {
  const imageUrl = profileImageFile
    ? `/files/open?fileId=${encodeURIComponent(profileImageFile.fileId)}`
    : "";

  return (
    <div className="grid gap-2">
      <div
        aria-label={
          profileImageFile
            ? `Profilbild von ${member.name}`
            : `Profilbild-Platzhalter fuer ${member.name}`
        }
        role="img"
        className={[
          "flex aspect-square min-h-28 items-center justify-center overflow-hidden rounded-lg border border-[var(--line-strong)] bg-white bg-cover bg-center text-3xl font-black text-neutral-500",
          profileImageFile ? "shadow-inner" : "",
        ].join(" ")}
        style={
          imageUrl
            ? {
                backgroundImage: `url("${imageUrl}")`,
              }
            : undefined
        }
      >
        {!profileImageFile ? getMemberInitials(member.name) : null}
      </div>
      <div className="text-xs text-neutral-500">
        {profileImageFile ? (
          <span className="line-clamp-2">{profileImageFile.name}</span>
        ) : (
          <span>Noch kein Profilbild</span>
        )}
      </div>
    </div>
  );
}

function MemberIntakePanel({ intake }: { intake: WorkspaceMember["intake"] }) {
  const hasAnswers = Object.values(intake.answers).some(
    (value) => value.trim().length > 0,
  );

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Discord-Aktenbogen</h3>
        <span className="border border-[var(--line)] bg-white px-2 py-1 text-xs font-medium">
          {intake.statusLabel}
        </span>
      </div>

      {hasAnswers ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <DetailRow label="Name" value={intake.answers.name || "-"} />
          <DetailRow label="Alter" value={intake.answers.age || "-"} />
          <DetailRow label="Wohnort" value={intake.answers.residence || "-"} />
          <DetailRow label="Beruf" value={intake.answers.profession || "-"} />
          <DetailRow label="Instagram" value={intake.answers.instagram || "-"} />
          <DetailRow label="Snapchat" value={intake.answers.snapchat || "-"} />
          <DetailRow label="TikTok" value={intake.answers.tiktok || "-"} />
          <DetailRow label="Stream" value={intake.answers.stream || "-"} />
          <DetailRow label="Ubisoft" value={intake.answers.ubisoft || "-"} />
          <DetailRow label="EA" value={intake.answers.ea || "-"} />
          <div className="sm:col-span-2">
            <DetailRow label="Notizen" value={intake.answers.notes || "-"} />
          </div>
          <div className="sm:col-span-2">
            <DetailRow label="Eingereicht" value={intake.answeredAt} />
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          Letzter Stand: {intake.requestedAt}
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium">{value}</dd>
    </div>
  );
}

function getMemberProfileImageFile(member: WorkspaceMember) {
  const currentImage = member.linkedFiles.find(
    (file) =>
      file.fileId === member.profileImageFileId && isMemberImageFile(file),
  );

  if (currentImage) {
    return currentImage;
  }

  return (
    member.linkedFiles.find(
      (file) => file.relationType === "avatar" && isMemberImageFile(file),
    ) ?? null
  );
}

function isMemberImageFile(file: WorkspaceMember["linkedFiles"][number]) {
  return file.type.toLowerCase().startsWith("image/");
}

function getMemberInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  return (parts.map((part) => part[0]).join("") || "?").toUpperCase();
}

function DetailBox({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-[var(--line)] bg-[var(--surface-muted)] p-3">
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-neutral-500">{detail}</p> : null}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

function getAdviceUploadValidation(files: File[]) {
  const totalSize = files.reduce((total, file) => total + file.size, 0);
  const summary =
    files.length > 0
      ? `${formatNumber(files.length)} Datei(en), ${formatFileSize(totalSize)} ausgewaehlt.`
      : "";
  const oversizedFile = files.find(
    (file) => file.size > ADVICE_UPLOAD_MAX_FILE_BYTES,
  );

  if (files.length > ADVICE_UPLOAD_MAX_FILES) {
    return {
      message: `Bitte maximal ${formatNumber(
        ADVICE_UPLOAD_MAX_FILES,
      )} Dateien auswaehlen. Aktuell sind ${formatNumber(files.length)} Dateien markiert.`,
      summary,
    };
  }

  if (oversizedFile) {
    return {
      message: `${oversizedFile.name} ist groesser als ${formatFileSize(
        ADVICE_UPLOAD_MAX_FILE_BYTES,
      )}.`,
      summary,
    };
  }

  if (totalSize > ADVICE_UPLOAD_MAX_TOTAL_BYTES) {
    return {
      message: `Die ausgewaehlten Belege sind zusammen ${formatFileSize(
        totalSize,
      )} gross. Erlaubt sind maximal ${formatFileSize(
        ADVICE_UPLOAD_MAX_TOTAL_BYTES,
      )}.`,
      summary,
    };
  }

  return { message: "", summary };
}

function getAdviceUploadProgress(items: AdviceUploadItem[]) {
  if (items.length === 0) {
    return { message: "", summary: "" };
  }

  const failedItem = items.find((item) => item.status === "failed");
  const uploadedCount = items.filter((item) => item.status === "uploaded").length;
  const totalSize = items.reduce((total, item) => total + item.size, 0);
  const summary = `${formatNumber(uploadedCount)}/${formatNumber(
    items.length,
  )} Datei(en) hochgeladen, ${formatFileSize(totalSize)} ausgewaehlt.`;

  if (failedItem) {
    return {
      message: `${failedItem.originalName}: ${
        failedItem.error || "Upload fehlgeschlagen."
      }`,
      summary,
    };
  }

  if (uploadedCount < items.length) {
    return {
      message: `Belege werden direkt zu Supabase hochgeladen (${formatNumber(
        uploadedCount,
      )}/${formatNumber(items.length)} fertig). Bitte kurz warten.`,
      summary,
    };
  }

  return {
    message: "",
    summary: `${formatNumber(items.length)} Datei(en), ${formatFileSize(
      totalSize,
    )} bereit fuer die Beratung.`,
  };
}

async function readAdviceEvidenceText(file: File) {
  if (!isAdviceEvidenceTextFile(file) || file.size > 200 * 1024) {
    return "";
  }

  try {
    return (await file.text()).replace(/\u0000/g, "").slice(0, 12_000);
  } catch {
    return "";
  }
}

function isAdviceEvidenceTextFile(file: File) {
  const contentType = file.type.toLowerCase();
  const extension = getLocalFileExtension(file.name);

  return (
    [
      "application/csv",
      "application/json",
      "application/markdown",
      "application/xml",
      "text/csv",
      "text/html",
      "text/markdown",
      "text/plain",
      "text/tab-separated-values",
      "text/xml",
      "text/yaml",
    ].includes(contentType) ||
    [
      ".csv",
      ".htm",
      ".html",
      ".json",
      ".md",
      ".tsv",
      ".txt",
      ".xml",
      ".yaml",
      ".yml",
    ].includes(extension)
  );
}

function getLocalFileExtension(value: string) {
  const match = value.toLowerCase().match(/\.[a-z0-9]+$/);

  return match?.[0] ?? "";
}

function formatDriveConflictType(type: string) {
  const labels: Record<string, string> = {
    db_drive_placeholder_without_drive_id: "Drive-Platzhalter ohne Verknuepfung",
    db_file_missing_in_drive: "Datei fehlt in Google Drive",
    drive_file_insert_failed: "Drive-Datei konnte nicht uebernommen werden",
    drive_file_move_permission_missing: "Drive-Schreibrecht zum Verschieben fehlt",
    drive_folder_create_permission_missing: "Drive-Schreibrecht zum Ordner-Anlegen fehlt",
    drive_folder_insert_failed: "Drive-Ordner konnte nicht uebernommen werden",
    drive_root_write_permission_missing: "Drive-Ordner ist nur lesbar",
    folder_parent_missing_drive_id: "Uebergeordneter Drive-Ordner fehlt",
    same_filename_different_drive_file: "Gleicher Dateiname mit anderer Drive-ID",
  };

  return labels[type] ?? "Drive-Konflikt";
}

function formatSessionRemaining(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
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

function formatNullable(value: number | null) {
  return value === null ? "-" : formatNumber(value);
}

function isSectionId(value?: string): value is SectionId {
  return sections.some((section) => section.id === value);
}
