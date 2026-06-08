import { Database, Lock, Shield } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpAction } from "@/app/login/actions";
import { hasSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const configured = hasSupabasePublicEnv();
  const nextPath = sanitizeNextPath(params.next ?? "/");

  if (configured) {
    const supabase = await createSupabaseServerClient();
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
              <p className="text-xs text-neutral-500">Website-Zugriff</p>
            </div>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Account erstellen
            </h1>
            <p className="mt-3 text-neutral-600">
              Die E-Mail bleibt fuer interne Account- und Passwortvorgaenge
              hinterlegt.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
            <Lock className="size-5 text-[var(--accent)]" aria-hidden="true" />
            <h2 className="font-semibold">Registrieren</h2>
          </div>
          <form action={signUpAction} className="grid gap-4 p-5">
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

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Benutzername
              </span>
              <input
                name="username"
                type="text"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Anzeigename
              </span>
              <input
                name="displayName"
                type="text"
                autoComplete="name"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                E-Mail
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
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
                autoComplete="new-password"
                minLength={8}
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                required
              />
            </label>

            <button
              type="submit"
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white"
            >
              <Shield className="size-4" aria-hidden="true" />
              <span>Account erstellen</span>
            </button>

            <Link
              href={`/login?next=${encodeURIComponent(nextPath)}`}
              className="flex h-10 items-center justify-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--foreground)]"
            >
              Zur Anmeldung
            </Link>
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
