import { Database, KeyRound, Lock, Shield } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signInAction } from "@/app/login/actions";
import { hasSupabasePublicEnv } from "@/lib/env";
import { mapLockdownStatusRow } from "@/lib/lockdown";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = hasSupabasePublicEnv();
  const nextPath = sanitizeNextPath(params.next ?? "/");
  let lockdownActive = false;
  let lockdownReason = "";

  if (configured) {
    const supabase = await createSupabaseServerClient();
    const { data: lockdownRows } = await supabase.rpc("get_lockdown_status");
    const lockdown = mapLockdownStatusRow(
      Array.isArray(lockdownRows)
        ? (lockdownRows[0] as Record<string, unknown> | null)
        : null,
    );
    lockdownActive = lockdown.active;
    lockdownReason = lockdown.reason;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect(nextPath);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="grid gap-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
              <Database className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">Schland Intern</p>
              <p className="text-xs text-neutral-500">Vercel + Supabase</p>
            </div>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Geschuetzter Zugang
            </h1>
            <p className="mt-3 text-neutral-600">
              Login per Benutzername, 2FA-Freigabe und Rollenpruefung fuer die
              Verwaltung.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Login", "Benutzername"],
              ["2FA", "MFA/AAL2"],
              ["Akten", "Grund + Log"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <p className="text-sm text-neutral-500">{label}</p>
                <p className="mt-2 font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
            <Lock className="size-5 text-[var(--accent)]" aria-hidden="true" />
            <h2 className="font-semibold">Anmelden</h2>
          </div>
          <form action={signInAction} className="grid gap-4 p-5">
            <input type="hidden" name="next" value={nextPath} />

            {!configured ? (
              <div className="rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900">
                Supabase-Umgebungsvariablen fehlen noch.
              </div>
            ) : null}

            {params.error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {params.error}
              </div>
            ) : null}

            {params.message ? (
              <div className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent-strong)]">
                {params.message}
              </div>
            ) : null}

            {lockdownActive ? (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950">
                <p className="font-semibold">Lockdown aktiv</p>
                <p className="mt-1">
                  Zugang nur mit Notfallschluessel.
                  {lockdownReason ? ` Grund: ${lockdownReason}` : ""}
                </p>
              </div>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Benutzername
              </span>
              <input
                name="username"
                type="text"
                autoComplete="username"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Passwort
              </span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-red-700">
                {lockdownActive
                  ? "Notfallschluessel"
                  : "Notfallschluessel (optional)"}
              </span>
              <input
                name="emergencyCode"
                type="password"
                autoComplete="one-time-code"
                className="h-10 rounded-md border border-red-300 bg-white px-3 font-mono text-sm uppercase tracking-[0.2em] outline-none focus:border-red-600"
                placeholder="Nur bei aktivem Lockdown"
                required={lockdownActive}
              />
            </label>

            <button
              type="submit"
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white"
            >
              <Shield className="size-4" aria-hidden="true" />
              <span>Anmelden</span>
            </button>

            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href={`/register?next=${encodeURIComponent(nextPath)}`}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--foreground)]"
              >
                <Lock className="size-4" aria-hidden="true" />
                <span>Registrieren</span>
              </Link>
              <Link
                href="/forgot-password"
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--foreground)]"
              >
                <KeyRound className="size-4" aria-hidden="true" />
                <span>Passwort vergessen</span>
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function sanitizeNextPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
