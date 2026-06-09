"use client";

import {
  Activity,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  Download,
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
  RefreshCw,
  Trash2,
  Upload,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createDiscordInviteRequestAction,
  createFolderAction,
  deleteDiscordInviteRequestAction,
  createMemberAction,
  deleteFileAction,
  deleteFolderAction,
  deleteMemberCaseAction,
  deleteModerationEventAction,
  downloadFileAction,
  linkMemberFileAction,
  moveFileAction,
  openMemberCaseAction,
  runModerationAction,
  runDiscordManualSyncAction,
  saveCategoryAction,
  saveRoleAction,
  setMemberDiscordAnalyticsAction,
  setFolderPermissionAction,
  setRolePermissionAction,
  setUserRoleAction,
  unlinkMemberFileAction,
  updateMemberCaseAction,
  updateModerationEventAction,
  uploadFileAction,
} from "@/app/actions";
import type { AuthStatus } from "@/lib/auth";
import type { DashboardSnapshot } from "@/lib/dashboard";
import type { EnvironmentStatus } from "@/lib/env";
import { patchNotes } from "@/lib/patch-notes";
import type {
  MemberStatusLabel,
  WorkspaceCategory,
  WorkspaceData,
  WorkspaceDiscordInvite,
  WorkspaceFile,
  WorkspaceFolder,
  WorkspaceFolderPermission,
  WorkspaceLogRow,
  WorkspaceMember,
  WorkspaceModerationEvent,
  WorkspacePermissionOption,
  WorkspaceRoleRow,
  WorkspaceSyncStatus,
  WorkspaceUserSummary,
} from "@/lib/workspace-data";

type SectionId =
  | "dashboard"
  | "members"
  | "files"
  | "categories"
  | "users"
  | "roles"
  | "activity"
  | "moderation"
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

const sections: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "members", label: "Mitgliederakten", icon: Shield },
  { id: "files", label: "Datei-Datenbank", icon: FileText },
  { id: "categories", label: "Kategorien", icon: Folder },
  { id: "users", label: "Benutzer", icon: Users },
  { id: "roles", label: "Rollen & Rechte", icon: KeyRound },
  { id: "activity", label: "Aktivitaet", icon: Activity },
  { id: "moderation", label: "Moderation", icon: Shield },
  { id: "sync", label: "Synchronisation", icon: Bot },
  { id: "settings", label: "Einstellungen", icon: Settings },
];

export function WorkspaceShell({
  authStatus,
  dashboardSnapshot,
  environmentStatus,
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
  const openedMemberId = members.some((member) => member.id === initialSelectedMemberId)
    ? String(initialSelectedMemberId)
    : "";
  const [memberSearch, setMemberSearch] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [selectedMemberOverride, setSelectedMemberId] = useState("");
  const [caseDetailsSuppressed, setCaseDetailsSuppressed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const selectedMemberId = members.some(
    (member) => member.id === selectedMemberOverride,
  )
    ? selectedMemberOverride
    : openedMemberId || members[0]?.id || "";

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

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
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
                    label={authStatus.mfaLevel === "aal2" ? "2FA aktiv" : "2FA offen"}
                  />
                ) : null}
                <button
                  type="button"
                  title="Patchnotes"
                  aria-expanded={patchNotesOpen}
                  onClick={() => setPatchNotesOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
                >
                  <FileText className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{latestPatchVersion}</span>
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
                    value={selectedMember.discordOnServer ? "Auf Server" : "Nicht gesehen"}
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
                    value={selectedMember.discordOnServer ? "Auf Server" : "Nicht gesehen"}
                  />
                  <DetailRow
                    label="Beigetreten"
                    value={selectedMember.discordJoinedAt}
                  />
                  <DetailRow label="Eingeladen von" value={selectedMember.invitedBy} />
                </dl>
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
  files,
  folders,
  mfaReady,
  roles,
}: {
  categories: WorkspaceCategory[];
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
          <a
            href="#file-upload"
            title="Datei hochladen"
            className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm"
          >
            <Upload className="size-4" aria-hidden="true" />
            <span>Hochladen</span>
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

      <div className="grid gap-3 md:grid-cols-4">
        <DetailBox label="Dateien" value={formatNumber(files.length)} />
        <DetailBox label="Ordner" value={formatNumber(folders.length)} />
        <DetailBox label="Kategorien" value={formatNumber(categories.length)} />
        <DetailBox label="Speicher" value={formatFileSize(totalFileSize)} />
      </div>

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
              name="file"
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
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Datei</th>
                <th className="px-4 py-3 font-medium">Ablage</th>
                <th className="px-4 py-3 font-medium">Typ</th>
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
                <TableEmpty colSpan={5} label="Keine Dateien fuer diesen Filter." />
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
  mfaReady,
  roles,
  users,
}: {
  mfaReady: boolean;
  roles: WorkspaceRoleRow[];
  users: WorkspaceUserSummary;
}) {
  const roleOptions = roles.filter((role) => role.id && role.role);
  const adminAssignments = users.rows.filter((user) =>
    user.roles.some((role) => role.roleKey === "administrator"),
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
      <div className="grid gap-3 border-t border-[var(--line)] p-4 md:grid-cols-3">
        {[
          ["Aktiv", users.active],
          ["2FA aktiv", users.mfaEnabled],
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
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Benutzer</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length > 0 ? (
                        user.roles.map((role) => {
                          const blocksLastAdmin =
                            role.roleKey === "administrator" && adminAssignments <= 1;

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
                                  blocksLastAdmin
                                    ? "Letzter Administrator bleibt aktiv"
                                    : `${role.role} entziehen`
                                }
                                disabled={!mfaReady || blocksLastAdmin}
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
              <TableEmpty colSpan={4} label="Noch keine Benutzer sichtbar." />
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
    (permission) => permission.id && permission.key,
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
                roles.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--line)] align-top">
                    <td className="px-4 py-3">
                      <form action={saveRoleAction} className="grid min-w-[320px] gap-2">
                        <input type="hidden" name="roleId" value={row.id} />
                        {row.roleKey === "administrator" ? (
                          <input type="hidden" name="active" value="on" />
                        ) : null}
                        <label className="grid gap-1">
                          <span className="text-xs font-medium uppercase text-neutral-500">
                            Schluessel
                          </span>
                          <input
                            name="roleKey"
                            defaultValue={row.roleKey}
                            readOnly={row.roleKey === "administrator"}
                            disabled={!mfaReady}
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
                            disabled={!mfaReady}
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
                            disabled={!mfaReady}
                            className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                          />
                        </label>
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              name="active"
                              type="checkbox"
                              defaultChecked={row.active}
                              disabled={!mfaReady || row.roleKey === "administrator"}
                              className="size-4 accent-[var(--accent)] disabled:cursor-not-allowed"
                            />
                            <span>Aktiv</span>
                          </label>
                          <button
                            type="submit"
                            disabled={!mfaReady}
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
                          row.permissionsDetailed.map((permission) => (
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
                                title={`${permission.description} entfernen`}
                                disabled={!mfaReady}
                                className="flex h-8 items-center gap-1 rounded-md bg-[var(--surface-muted)] px-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <span>{permission.description}</span>
                                <XCircle className="size-3.5" aria-hidden="true" />
                              </button>
                            </form>
                          ))
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
                          disabled={!mfaReady || permissionOptions.length === 0}
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
                          disabled={!mfaReady || permissionOptions.length === 0}
                          className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                          <span>Hinzufuegen</span>
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
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
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      role="dialog"
    >
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col border border-[var(--line-strong)] bg-[var(--surface)] shadow-[10px_10px_0_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line-strong)] bg-[var(--surface-muted)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase">Patchnotes</p>
            <p className="truncate text-xs text-neutral-600">
              Aenderungen an Schland DB
            </p>
          </div>
          <button
            type="button"
            title="Patchnotes schliessen"
            onClick={onClose}
            className="flex size-8 items-center justify-center border border-[var(--line)] bg-white text-neutral-700"
          >
            <XCircle className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-3 overflow-y-auto p-4">
          {patchNotes.map((note) => (
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
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  authStatus,
  environmentStatus,
}: {
  authStatus: AuthStatus;
  environmentStatus: EnvironmentStatus;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
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
            label="2FA AAL2"
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
            "2FA-Pflicht fuer Mitgliederakten",
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
        <SectionHeader icon={Database} title="Datenhaltung" />
        <div className="grid gap-3 border-t border-[var(--line)] p-4 text-sm">
          <StatusLine active label="Mitgliederakten per Discord-ID" />
          <StatusLine active label="Bots ausgeschlossen" />
          <StatusLine active label="Moderationsregister dauerhaft" />
          <StatusLine active label="Einladungen per Discord-DM" />
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium">{value}</dd>
    </div>
  );
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--surface-muted)] p-3">
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold">{value}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
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
