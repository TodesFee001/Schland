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
  FileText,
  Folder,
  Gauge,
  KeyRound,
  Lock,
  LogOut,
  Pencil,
  Search,
  Server,
  Settings,
  Shield,
  Trash2,
  Upload,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { claimFirstAdminAction, createMemberAction } from "@/app/actions";
import type { AuthStatus } from "@/lib/auth";
import type { DashboardSnapshot } from "@/lib/dashboard";
import type { EnvironmentStatus } from "@/lib/env";
import type {
  MemberStatusLabel,
  WorkspaceCategory,
  WorkspaceData,
  WorkspaceFolder,
  WorkspaceLogRow,
  WorkspaceMember,
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

const sections: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "members", label: "Mitgliederakten", icon: Shield },
  { id: "files", label: "Datei-Datenbank", icon: FileText },
  { id: "categories", label: "Kategorien", icon: Folder },
  { id: "users", label: "Benutzer", icon: Users },
  { id: "roles", label: "Rollen & Rechte", icon: KeyRound },
  { id: "activity", label: "Aktivitaet", icon: Activity },
  { id: "sync", label: "Synchronisation", icon: Bot },
  { id: "settings", label: "Einstellungen", icon: Settings },
];

export function WorkspaceShell({
  authStatus,
  dashboardSnapshot,
  environmentStatus,
  initialSection,
  setupNotice,
  workspaceData,
}: WorkspaceShellProps) {
  const members = workspaceData.members;
  const [activeSection, setActiveSection] = useState<SectionId>(
    isSectionId(initialSection) ? initialSection : "dashboard",
  );
  const [memberSearch, setMemberSearch] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState(
    members[0]?.id ?? "",
  );

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
  const mfaReady = authStatus.mfaLevel === "aal2";
  const canOpenMember = mfaReady && accessReason.trim().length >= 8;
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

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-[var(--line)] bg-[var(--surface)] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
                <Database className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold">Schland Intern</p>
                <p className="text-xs text-neutral-500">Vercel + Supabase</p>
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
                      "flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm transition",
                      isActive
                        ? "bg-[var(--accent)] text-white"
                        : "text-neutral-700 hover:bg-[var(--surface-muted)]",
                    ].join(" ")}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{section.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
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
          <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--background)]/95 px-4 py-3 backdrop-blur md:px-6">
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
                  title="Benachrichtigungen"
                  className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
                >
                  <Bell className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">3</span>
                </button>
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

          <div className="grid gap-5 px-4 py-5 md:px-6">
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
    </main>
  );

  function renderActiveSection() {
    switch (activeSection) {
      case "members":
        return (
          <MembersSection
            accessReason={accessReason}
            canOpenMember={canOpenMember}
            filteredMembers={filteredMembers}
            memberSearch={memberSearch}
            mfaReady={mfaReady}
            selectedMember={selectedMember}
            selectedMemberId={selectedMemberId}
            setAccessReason={setAccessReason}
            setMemberSearch={setMemberSearch}
            setSelectedMemberId={setSelectedMemberId}
          />
        );
      case "files":
        return <FilesSection folders={workspaceData.folders} />;
      case "categories":
        return <CategoriesSection categories={workspaceData.categories} />;
      case "users":
        return <UsersSection users={workspaceData.users} />;
      case "roles":
        return <RolesSection roles={workspaceData.roles} />;
      case "activity":
        return <ActivitySection members={members} />;
      case "sync":
        return <SyncSection sync={workspaceData.sync} />;
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
  canOpenMember,
  filteredMembers,
  memberSearch,
  mfaReady,
  selectedMember,
  selectedMemberId,
  setAccessReason,
  setMemberSearch,
  setSelectedMemberId,
}: {
  accessReason: string;
  canOpenMember: boolean;
  filteredMembers: WorkspaceMember[];
  memberSearch: string;
  mfaReady: boolean;
  selectedMember: WorkspaceMember | null;
  selectedMemberId: string;
  setAccessReason: (value: string) => void;
  setMemberSearch: (value: string) => void;
  setSelectedMemberId: (value: string) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader
          icon={Shield}
          title="Geschuetzte Akten"
          action={
            <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent-strong)]">
              {mfaReady ? "2FA aktiv" : "2FA offen"}
            </span>
          }
        />

        <div className="grid gap-4 border-t border-[var(--line)] p-4">
          <form action={createMemberAction} className="grid gap-3 border-b border-[var(--line)] pb-4">
            {!mfaReady ? (
              <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Mitgliederakten koennen erst mit aktiver 2FA-Sitzung angelegt werden.
                </span>
                <a
                  href="/security?setup=member-create-aal2"
                  className="flex h-9 w-fit items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white"
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
                    Discord-Name
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

          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
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
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Zugriffsgrund
              </span>
              <input
                value={accessReason}
                onChange={(event) => setAccessReason(event.target.value)}
                placeholder="z.B. Moderationsfall pruefen"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
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
                    className={[
                      "border-t border-[var(--line)]",
                      selectedMemberId === member.id ? "bg-[var(--accent-soft)]" : "",
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
                      <div>{member.messagesMonth} Nachrichten</div>
                      <div className="text-xs text-neutral-500">
                        {member.voiceHoursMonth} Voice-Stunden
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        title={
                          canOpenMember
                            ? "Akte oeffnen"
                            : "Zugriffsgrund eintragen"
                        }
                        disabled={!canOpenMember}
                        onClick={() => setSelectedMemberId(member.id)}
                        className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Eye className="size-4" aria-hidden="true" />
                        <span>Oeffnen</span>
                      </button>
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
      </section>

      <aside className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Lock} title="Aktendetail" />
        <div className="grid gap-5 border-t border-[var(--line)] p-4">
          {!selectedMember ? (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-neutral-600">
              Waehle eine Mitgliederakte aus, sobald Daten vorhanden sind.
            </div>
          ) : !canOpenMember ? (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-neutral-600">
              {mfaReady
                ? "Ein valider Zugriffsgrund schaltet die Detailansicht frei."
                : "2FA muss aktiv sein, bevor die Detailansicht freigeschaltet wird."}
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
                  <DetailRow label="Discord" value={selectedMember.discordName} />
                  <DetailRow label="Eingeladen von" value={selectedMember.invitedBy} />
                </dl>
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
                        key={file}
                        className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 text-sm last:border-b-0"
                      >
                        <span className="truncate">{file}</span>
                        <button
                          type="button"
                          title="Datei oeffnen"
                          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--line)]"
                        >
                          <Eye className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-neutral-600">
                      Noch keine Dateien verknuepft.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function FilesSection({ folders }: { folders: WorkspaceFolder[] }) {
  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 md:flex-row md:items-center md:justify-between">
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
          <button className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm">
            <Upload className="size-4" aria-hidden="true" />
            <span>Hochladen</span>
          </button>
          <button className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white">
            <Folder className="size-4" aria-hidden="true" />
            <span>Ordner</span>
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Folder} title="Ordnerrechte" />
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Kategorie</th>
                <th className="px-4 py-3 font-medium">Ordner</th>
                <th className="px-4 py-3 font-medium">Sichtbar fuer</th>
                <th className="px-4 py-3 font-medium">Upload fuer</th>
                <th className="px-4 py-3 font-medium">Dateien</th>
                <th className="px-4 py-3 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {folders.length > 0 ? (
                folders.map((folder) => (
                  <tr key={folder.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">{folder.category}</td>
                    <td className="px-4 py-3 font-medium">{folder.folder}</td>
                    <td className="px-4 py-3">{folder.visibleFor}</td>
                    <td className="px-4 py-3">{folder.uploadFor}</td>
                    <td className="px-4 py-3">{folder.files}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <IconButton icon={Eye} label="Oeffnen" />
                        <IconButton icon={Download} label="Herunterladen" />
                        <IconButton icon={Pencil} label="Bearbeiten" />
                        <IconButton icon={Trash2} label="Loeschen" danger />
                      </div>
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

function CategoriesSection({ categories }: { categories: WorkspaceCategory[] }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <SectionHeader icon={Folder} title="Kategorien" />
      <div className="grid gap-2 border-t border-[var(--line)] p-4 md:grid-cols-2 xl:grid-cols-4">
        {categories.length > 0 ? (
          categories.map((category, index) => (
            <article
              key={category.id}
              className="rounded-lg border border-[var(--line)] bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{category.name}</p>
                <span className="font-mono text-xs text-neutral-500">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-3 text-sm text-neutral-500">
                {category.description}
              </p>
            </article>
          ))
        ) : (
          <EmptyPanel label="Noch keine Kategorien angelegt." />
        )}
      </div>
    </section>
  );
}

function UsersSection({ users }: { users: WorkspaceUserSummary }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <SectionHeader
        icon={Users}
        title="Benutzerverwaltung"
        action={
          <button className="flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm text-white">
            <UserCog className="size-4" aria-hidden="true" />
            <span>Benutzer</span>
          </button>
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
    </section>
  );
}

function RolesSection({ roles }: { roles: WorkspaceRoleRow[] }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <SectionHeader icon={KeyRound} title="Rollen & Berechtigungen" />
      <div className="overflow-x-auto border-t border-[var(--line)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Rolle</th>
              <th className="px-4 py-3 font-medium">Berechtigungen</th>
              <th className="px-4 py-3 font-medium">Benutzer</th>
              <th className="px-4 py-3 font-medium">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {roles.length > 0 ? (
              roles.map((row) => (
                <tr key={row.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 font-medium">{row.role}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.permissions.length > 0 ? (
                        row.permissions.slice(0, 5).map((permission) => (
                          <span
                            key={permission}
                            className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs"
                          >
                            {permission}
                          </span>
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
                    <button className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm">
                      <Pencil className="size-4" aria-hidden="true" />
                      <span>Bearbeiten</span>
                    </button>
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
  );
}

function ActivitySection({ members }: { members: WorkspaceMember[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {members.length > 0 ? (
        members.map((member) => (
          <article
            key={member.id}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{member.name}</p>
                <p className="font-mono text-xs text-neutral-500">{member.id}</p>
              </div>
              <Activity className="size-5 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MetricTile label="Nachrichten Monat" value={member.messagesMonth} />
              <MetricTile
                label="Voice-Stunden Monat"
                value={member.voiceHoursMonth}
              />
              <MetricTile label="Letzte Aktivitaet" value={member.lastActivity} wide />
            </div>
          </article>
        ))
      ) : (
        <div className="xl:col-span-3">
          <EmptyPanel label="Noch keine Aktivitaetsdaten vorhanden." />
        </div>
      )}
    </div>
  );
}

function SyncSection({ sync }: { sync: WorkspaceSyncStatus }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        <SectionHeader icon={Bot} title="Discord-Synchronisation" />
        <div className="grid gap-4 border-t border-[var(--line)] p-4">
          {sync.rows.map(({ active, label, status }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 border-b border-[var(--line)] py-3 last:border-b-0"
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

      <aside className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-3">
          <Server className="size-5 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">Sync-Status</h2>
        </div>
        <dl className="mt-5 grid gap-3 text-sm">
          <DetailRow label="Letzter Vollabgleich" value={sync.lastFullSync} />
          <DetailRow label="Fehler" value={formatNumber(sync.errorCount)} />
          <DetailRow label="Manueller Sync" value={sync.manualSync} />
          <DetailRow label="Bot" value={sync.botState} />
        </dl>
      </aside>
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
        <SectionHeader icon={UserCog} title="Erststart" />
        <div className="grid gap-4 border-t border-[var(--line)] p-4 text-sm">
          <p className="text-neutral-600">
            Der erste echte Benutzer kann einmalig Administrator werden. Danach
            ist dieser Startknopf wirkungslos.
          </p>
          <form action={claimFirstAdminAction}>
            <button
              type="submit"
              disabled={!authStatus.signedIn}
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Shield className="size-4" aria-hidden="true" />
              <span>Administrator aktivieren</span>
            </button>
          </form>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium">{value}</dd>
    </div>
  );
}

function MetricTile({
  label,
  value,
  wide,
}: {
  label: string;
  value: number | string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function IconButton({
  danger,
  icon: Icon,
  label,
}: {
  danger?: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      className={[
        "flex size-8 items-center justify-center rounded-md border bg-white",
        danger
          ? "border-red-200 text-[var(--danger)]"
          : "border-[var(--line)] text-neutral-700",
      ].join(" ")}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

function formatNullable(value: number | null) {
  return value === null ? "-" : formatNumber(value);
}

function isSectionId(value?: string): value is SectionId {
  return sections.some((section) => section.id === value);
}
