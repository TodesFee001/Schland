import { Database, KeyRound } from "lucide-react";
import Link from "next/link";

import { sendPasswordResetAction } from "@/app/login/actions";
import { hasSupabasePublicEnv } from "@/lib/env";

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const configured = hasSupabasePublicEnv();

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
              <p className="text-xs text-neutral-500">Account-Sicherheit</p>
            </div>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Passwort vergessen
            </h1>
            <p className="mt-3 text-neutral-600">
              Der Reset laeuft ueber die intern hinterlegte E-Mail-Adresse.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
            <KeyRound className="size-5 text-[var(--accent)]" aria-hidden="true" />
            <h2 className="font-semibold">Reset-Link senden</h2>
          </div>
          <form action={sendPasswordResetAction} className="grid gap-4 p-5">
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

            <button
              type="submit"
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              <span>Reset-Link senden</span>
            </button>

            <Link
              href="/login"
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
