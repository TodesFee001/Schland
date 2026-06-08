import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MfaManager } from "@/components/mfa-manager";
import { getAuthStatus } from "@/lib/auth";

type SecurityPageProps = {
  searchParams: Promise<{
    setup?: string;
  }>;
};

export default async function SecurityPage({ searchParams }: SecurityPageProps) {
  const params = await searchParams;
  const authStatus = await getAuthStatus();

  if (!authStatus.configured) {
    redirect("/");
  }

  if (!authStatus.signedIn) {
    redirect("/login?next=/security");
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
      <div className="mx-auto grid w-full max-w-3xl gap-5">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Zurueck</span>
        </Link>
        {params.setup === "admin-claimed" ? (
          <div className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent-strong)]">
            Administratorrolle aktiviert. Richte jetzt 2FA ein, damit
            Mitgliederakten freigeschaltet werden koennen.
          </div>
        ) : null}
        {params.setup === "member-create-aal2" ? (
          <div className="rounded-lg border border-amber-200 bg-[#fff4d6] p-3 text-sm text-amber-900">
            Mitgliederakten brauchen eine aktive 2FA-Sitzung. Bestaetige hier
            einmal deinen Code und versuche es danach erneut.
          </div>
        ) : null}
        <MfaManager email={authStatus.email} />
      </div>
    </main>
  );
}
