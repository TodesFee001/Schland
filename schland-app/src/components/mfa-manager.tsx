"use client";

import { CheckCircle2, KeyRound, QrCode, Shield, XCircle } from "lucide-react";
import Image from "next/image";
import * as QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type MfaFactor = {
  id: string;
  factor_type?: string;
  friendly_name?: string | null;
  status?: string;
};

type MfaFactorGroups = {
  all?: MfaFactor[];
  totp?: MfaFactor[];
  webauthn?: MfaFactor[];
};

type MfaErrorLike = {
  code?: string;
  message?: string;
  name?: string;
};

type WebAuthnOptions = {
  rpId?: string;
  rpOrigins?: string[];
  signal?: AbortSignal;
};

type WebAuthnMfaApi = {
  authenticate(params: {
    factorId: string;
    webauthn?: WebAuthnOptions;
  }): Promise<{ data: unknown; error: MfaErrorLike | null }>;
  register(params: {
    friendlyName: string;
    webauthn?: WebAuthnOptions;
  }): Promise<{ data: unknown; error: MfaErrorLike | null }>;
};

export function MfaManager({ email }: { email?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [aal, setAal] = useState("aal1");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [factorId, setFactorId] = useState("");
  const [totpFactors, setTotpFactors] = useState<MfaFactor[]>([]);
  const [webAuthnFactors, setWebAuthnFactors] = useState<MfaFactor[]>([]);
  const [webAuthnBusy, setWebAuthnBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [qrCode, setQrCode] = useState("");

  function applyFactorGroups(data: unknown) {
    setTotpFactors(readMfaFactors(data, "totp"));
    setWebAuthnFactors(readMfaFactors(data, "webauthn"));
  }

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
        applyFactorGroups(factorResult.data);
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
      applyFactorGroups(factorResult.data);
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
    setQrCode(await createSchlandTotpQrCode(data.totp.uri, email, data.totp.qr_code));

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

    const existingFactor = totpFactors.find((factor) => factor.status === "verified");

    if (!existingFactor) {
      setError("Kein bestaetigter TOTP-Faktor gefunden.");
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

  async function registerWebAuthn() {
    setError("");
    setMessage("");
    setWebAuthnBusy(true);

    try {
      const webauthn = getWebAuthnApi();

      if (!webauthn) {
        setError("Hardware-Key 2FA ist in dieser Supabase-Version nicht verfuegbar.");
        return;
      }

      if (!isWebAuthnSupported()) {
        setError("Hardware-Key braucht HTTPS und einen aktuellen Browser.");
        return;
      }

      const { error: registerError } = await webauthn.register({
        friendlyName: "Schland Hardware-Key",
        webauthn: getWebAuthnOptions(),
      });

      if (registerError) {
        setError(formatMfaError(registerError));
        return;
      }

      await supabase.rpc("mark_own_two_factor_enabled");

      setMessage("Hardware-Key wurde aktiviert.");
      await refreshStatus();
    } finally {
      setWebAuthnBusy(false);
    }
  }

  async function authenticateWebAuthn() {
    setError("");
    setMessage("");
    setWebAuthnBusy(true);

    try {
      const webauthn = getWebAuthnApi();

      if (!webauthn) {
        setError("Hardware-Key 2FA ist in dieser Supabase-Version nicht verfuegbar.");
        return;
      }

      if (!isWebAuthnSupported()) {
        setError("Hardware-Key braucht HTTPS und einen aktuellen Browser.");
        return;
      }

      const existingFactor =
        webAuthnFactors.find((factor) => factor.status === "verified") ??
        webAuthnFactors[0];

      if (!existingFactor) {
        setError("Kein bestaetigter Hardware-Key gefunden.");
        return;
      }

      const { error: authError } = await webauthn.authenticate({
        factorId: existingFactor.id,
        webauthn: getWebAuthnOptions(),
      });

      if (authError) {
        setError(formatMfaError(authError));
        return;
      }

      await supabase.rpc("mark_own_two_factor_enabled");

      setMessage("Sitzung wurde per Hardware-Key freigeschaltet.");
      await refreshStatus();
    } finally {
      setWebAuthnBusy(false);
    }
  }

  function getWebAuthnApi() {
    return (supabase.auth.mfa as { webauthn?: WebAuthnMfaApi }).webauthn;
  }

  const registeredFactors = [
    ...totpFactors.map((factor) => ({
      ...factor,
      factor_type: "totp",
    })),
    ...webAuthnFactors.map((factor) => ({
      ...factor,
      factor_type: "webauthn",
    })),
  ];
  const hasVerifiedTotpFactor = totpFactors.some(isVerifiedFactor);
  const hasVerifiedWebAuthnFactor = webAuthnFactors.some(isVerifiedFactor);
  const hasVerifiedFactor = hasVerifiedTotpFactor || hasVerifiedWebAuthnFactor;

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
            {registeredFactors.length > 0 ? (
              registeredFactors.map((factor) => (
                <div
                  key={`${factor.factor_type}-${factor.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {factor.friendly_name ??
                        (factor.factor_type === "webauthn"
                          ? "Hardware-Key"
                          : "Authenticator-App")}
                    </p>
                    <p className="truncate text-sm text-neutral-500">
                      {factor.factor_type === "webauthn"
                        ? "Hardware-Key"
                        : "QR/TOTP"}{" "}
                      · {factor.status}
                    </p>
                  </div>
                  {factor.factor_type === "webauthn" ? (
                    <KeyRound className="size-5 text-[var(--accent)]" aria-hidden="true" />
                  ) : (
                    <CheckCircle2
                      className="size-5 text-[var(--accent)]"
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-neutral-600">
                Noch kein 2FA-Faktor hinterlegt.
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
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0"
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
            <div className="grid gap-2 sm:grid-cols-2">
              {hasVerifiedTotpFactor ? (
                <button
                  type="button"
                  onClick={challengeExistingTotp}
                  className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0"
                >
                  <QrCode className="size-4" aria-hidden="true" />
                  <span>Per Code freischalten</span>
                </button>
              ) : null}
              {hasVerifiedWebAuthnFactor ? (
                <button
                  type="button"
                  onClick={authenticateWebAuthn}
                  disabled={webAuthnBusy}
                  className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <KeyRound className="size-4" aria-hidden="true" />
                  <span>{webAuthnBusy ? "Key pruefen..." : "Per Key freischalten"}</span>
                </button>
              ) : null}
            </div>
          )
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={enrollTotp}
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0"
            >
              <QrCode className="size-4" aria-hidden="true" />
              <span>QR/TOTP einrichten</span>
            </button>
              <button
                type="button"
                onClick={registerWebAuthn}
                disabled={webAuthnBusy}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--foreground)] transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <KeyRound className="size-4" aria-hidden="true" />
                <span>{webAuthnBusy ? "Key pruefen..." : "Hardware-Key einrichten"}</span>
              </button>
          </div>
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

async function createSchlandTotpQrCode(
  uri: string,
  email?: string,
  fallbackQrCode?: string,
) {
  try {
    const customUri = buildSchlandTotpUri(uri, email);

    return await QRCode.toDataURL(customUri, {
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
      margin: 1,
      width: 192,
    });
  } catch {
    return fallbackQrCode ?? "";
  }
}

function buildSchlandTotpUri(uri: string, email?: string) {
  const url = new URL(uri);
  const account = email?.trim() || "Schland Benutzer";
  const label = `Schland DB:${account}`;

  url.pathname = `/${encodeURIComponent(label)}`;
  url.searchParams.set("issuer", "Schland DB");

  return url.toString();
}

function readMfaFactors(data: unknown, type: "totp" | "webauthn") {
  const groups = (data ?? {}) as MfaFactorGroups;
  const directGroup = groups[type];

  if (Array.isArray(directGroup)) {
    return directGroup;
  }

  return Array.isArray(groups.all)
    ? groups.all.filter((factor) => factor.factor_type === type && isVerifiedFactor(factor))
    : [];
}

function isVerifiedFactor(factor: MfaFactor) {
  return factor.status === "verified";
}

function getWebAuthnOptions(): WebAuthnOptions {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    rpId: window.location.hostname,
    rpOrigins: [window.location.origin],
  };
}

function isWebAuthnSupported() {
  return Boolean(
    typeof window !== "undefined" &&
      window.isSecureContext &&
      "PublicKeyCredential" in window &&
      "credentials" in navigator &&
      typeof navigator.credentials.create === "function" &&
      typeof navigator.credentials.get === "function",
  );
}

function formatMfaError(error: MfaErrorLike) {
  const raw = `${error.code ?? ""} ${error.name ?? ""} ${error.message ?? ""}`.toLowerCase();

  if (
    raw.includes("webauthn_enroll_not_enabled") ||
    raw.includes("webauthn_verify_not_enabled")
  ) {
    return "Hardware-Key 2FA ist im Supabase-Projekt noch nicht aktiviert.";
  }

  if (raw.includes("browser does not support webauthn")) {
    return "Dieser Browser unterstuetzt Hardware-Key 2FA nicht.";
  }

  if (raw.includes("previously registered")) {
    return "Dieser Hardware-Key ist fuer diesen Account bereits registriert.";
  }

  if (
    raw.includes("notallowed") ||
    raw.includes("not allowed") ||
    raw.includes("aborted") ||
    raw.includes("timed out")
  ) {
    return "Key-Vorgang wurde abgebrochen oder ist abgelaufen.";
  }

  return error.message ?? "2FA-Aktion konnte nicht abgeschlossen werden.";
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
