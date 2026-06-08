import { KeyRound, Lock } from "lucide-react";
import Link from "next/link";

import { updatePasswordAction } from "@/app/login/actions";
import { hasSupabasePublicEnv } from "@/lib/env";

type UpdatePasswordPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
  const params = await searchParams;
  const configured = hasSupabasePublicEnv();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <section className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
            <KeyRound className="size-5 text-[var(--accent)]" aria-hidden="true" />
            <h1 className="font-semibold">Neues Passwort</h1>
          </div>
          <form action={updatePasswordAction} className="grid gap-4 p-5">
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

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                Passwort wiederholen
              </span>
              <input
                name="passwordConfirm"
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
              <Lock className="size-4" aria-hidden="true" />
              <span>Passwort speichern</span>
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
