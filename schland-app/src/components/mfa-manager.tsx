"use client";

import { CheckCircle2, KeyRound, QrCode, Shield, XCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  status?: string;
};

export function MfaManager({ email }: { email?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [aal, setAal] = useState("aal1");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [factorId, setFactorId] = useState("");
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [qrCode, setQrCode] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadInitialStatus() {
      const [factorResult, aalResult] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      if (!mounted) {
        return;
      }

      if (factorResult.error) {
        setError(factorResult.error.message);
      } else {
        setFactors(factorResult.data?.totp ?? []);
      }

      if (aalResult.data?.currentLevel) {
        setAal(aalResult.data.currentLevel);
      }

      setLoading(false);
    }

    void loadInitialStatus();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function refreshStatus() {
    setLoading(true);
    setError("");

    const [factorResult, aalResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

    if (factorResult.error) {
      setError(factorResult.error.message);
    } else {
      setFactors(factorResult.data?.totp ?? []);
    }

    if (aalResult.data?.currentLevel) {
      setAal(aalResult.data.currentLevel);
    }

    setLoading(false);
  }

  async function enrollTotp() {
    setError("");
    setMessage("");

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Schland Intern",
    });

    if (enrollError) {
      setError(enrollError.message);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({
        factorId: data.id,
      });

    if (challengeError) {
      setError(challengeError.message);
      return;
    }

    setChallengeId(challenge.id);
    setMessage("QR-Code scannen und Code bestaetigen.");
  }

  async function challengeExistingTotp() {
    setError("");
    setMessage("");

    const existingFactor = factors.find((factor) => factor.status === "verified");

    if (!existingFactor) {
      setError("Kein bestaetigter 2FA-Faktor gefunden.");
      return;
    }

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({
        factorId: existingFactor.id,
      });

    if (challengeError) {
      setError(challengeError.message);
      return;
    }

    setCode("");
    setFactorId(existingFactor.id);
    setChallengeId(challenge.id);
    setQrCode("");
    setMessage("Code aus deiner Authenticator-App eingeben.");
  }

  async function verifyTotp() {
    setError("");
    setMessage("");

    if (!factorId || !challengeId || !code.trim()) {
      setError("Code fehlt.");
      return;
    }

    const wasEnrollment = Boolean(qrCode);

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.trim(),
    });

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    await supabase.rpc("mark_own_two_factor_enabled");

    setCode("");
    setQrCode("");
    setFactorId("");
    setChallengeId("");
    setMessage(wasEnrollment ? "2FA wurde aktiviert." : "Sitzung wurde freigeschaltet.");
    await refreshStatus();
  }

  const hasVerifiedFactor = factors.some((factor) => factor.status === "verified");

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Shield className="size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-semibold">Zwei-Faktor-Authentifizierung</h2>
            <p className="truncate text-sm text-neutral-500">{email ?? "Benutzer"}</p>
          </div>
        </div>
        <StatusBadge active={aal === "aal2"} label={aal === "aal2" ? "AAL2" : "AAL1"} />
      </div>

      <div className="grid gap-4 p-5">
        {loading ? (
          <p className="text-sm text-neutral-500">Status wird geladen...</p>
        ) : (
          <div className="grid gap-3">
            {factors.length > 0 ? (
              factors.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3"
                >
                  <div>
                    <p className="font-medium">
                      {factor.friendly_name ?? "Authenticator-App"}
                    </p>
                    <p className="text-sm text-neutral-500">{factor.status}</p>
                  </div>
                  <CheckCircle2
                    className="size-5 text-[var(--accent)]"
                    aria-hidden="true"
                  />
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-neutral-600">
                Noch kein TOTP-Faktor hinterlegt.
              </div>
            )}
          </div>
        )}

        {loading ? null : challengeId ? (
          <div className="grid gap-4 rounded-lg border border-[var(--line)] p-4">
            <div className="flex items-center gap-2">
              {qrCode ? (
                <QrCode className="size-5 text-[var(--accent)]" aria-hidden="true" />
              ) : (
                <KeyRound className="size-5 text-[var(--accent)]" aria-hidden="true" />
              )}
              <p className="font-medium">
                {qrCode ? "Authenticator verbinden" : "Sitzung freischalten"}
              </p>
            </div>
            {qrCode ? (
              <Image
                src={qrCode}
                alt="QR-Code fuer Authenticator-App"
                width={192}
                height={192}
                unoptimized
                className="size-48 rounded-lg border border-[var(--line)] bg-white p-2"
              />
            ) : null}
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase text-neutral-500">
                6-stelliger Code
              </span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="button"
              onClick={verifyTotp}
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <span>Code bestaetigen</span>
            </button>
          </div>
        ) : hasVerifiedFactor ? (
          aal === "aal2" ? (
            <div className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent-strong)]">
              Diese Sitzung ist fuer Mitgliederakten freigeschaltet.
            </div>
          ) : (
            <button
              type="button"
              onClick={challengeExistingTotp}
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              <span>Sitzung freischalten</span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={enrollTotp}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            <span>2FA einrichten</span>
          </button>
        )}

        {message ? (
          <div className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent-strong)]">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={[
        "flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "bg-red-50 text-red-900",
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
