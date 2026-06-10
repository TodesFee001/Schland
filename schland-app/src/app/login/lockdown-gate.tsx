"use client";

import { KeyRound, RadioTower, Siren, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type LockdownGateProps = {
  active: boolean;
  reason: string;
};

export function LockdownGate({ active, reason }: LockdownGateProps) {
  const [code, setCode] = useState("");
  const [unlocked, setUnlocked] = useState(!active);
  const cleanupSoundRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || unlocked) {
      cleanupSoundRef.current?.();
      cleanupSoundRef.current = null;

      return;
    }

    const start = () => {
      cleanupSoundRef.current?.();
      cleanupSoundRef.current = startEmergencySound();
    };

    start();
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });

    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      cleanupSoundRef.current?.();
      cleanupSoundRef.current = null;
    };
  }, [active, unlocked]);

  if (!active) {
    return (
      <label className="grid gap-2">
        <span className="text-xs font-medium uppercase text-red-700">
          Notfallschluessel (optional)
        </span>
        <input
          name="emergencyCode"
          type="password"
          autoComplete="one-time-code"
          className="h-10 rounded-md border border-red-300 bg-white px-3 font-mono text-sm uppercase tracking-[0.2em] outline-none focus:border-red-600"
          placeholder="Nur bei aktivem Lockdown"
        />
      </label>
    );
  }

  return (
    <>
      <input name="emergencyCode" type="hidden" value={code} />

      {unlocked ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950">
          <p className="font-semibold">Notfallschluessel geladen</p>
          <p className="mt-1">Login kann jetzt mit Benutzername und Passwort fortgesetzt werden.</p>
        </div>
      ) : (
        <div className="lockdown-login-overlay fixed inset-0 z-[90] overflow-hidden text-white">
          <div className="lockdown-login-grid absolute inset-0" />
          <div className="lockdown-login-sweep absolute inset-0" />
          <div className="absolute inset-0 border-[18px] border-red-600/55 shadow-[inset_0_0_160px_rgba(220,38,38,0.7)]" />

          <div className="absolute left-1/2 top-8 flex -translate-x-1/2 items-center gap-3 border border-red-400 bg-black/70 px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.35em] text-red-100">
            <RadioTower className="size-4 lockdown-login-blink" aria-hidden="true" />
            Emergency Broadcast
          </div>

          <div className="absolute left-1/2 top-1/2 grid w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-5 border-2 border-red-500 bg-[#160101]/90 p-6 text-center shadow-[0_0_120px_rgba(248,113,113,0.55)]">
            <div className="lockdown-login-core mx-auto flex size-32 items-center justify-center rounded-full border-2 border-red-300 bg-red-950">
              <Siren className="size-16 text-red-100" aria-hidden="true" />
            </div>

            <div>
              <p className="font-mono text-xs font-black uppercase tracking-[0.5em] text-red-200">
                Schland Verwaltung
              </p>
              <h1 className="lockdown-login-title mt-2 text-5xl font-black uppercase tracking-[0.16em] text-red-50 md:text-7xl">
                Lockdown
              </h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-red-100">
                Der normale Zugang ist verdeckt. Gib den generierten Notfallschluessel ein,
                um die Anmeldung freizugeben.
              </p>
              {reason ? (
                <p className="mx-auto mt-2 max-w-2xl border border-red-800 bg-black/35 px-3 py-2 text-xs text-red-200">
                  Grund: {reason}
                </p>
              ) : null}
            </div>

            <div className="mx-auto grid w-full max-w-md gap-3">
              <label className="grid gap-2 text-left">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-red-200">
                  Notfallschluessel
                </span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && code.trim().length >= 8) {
                      event.preventDefault();
                      setUnlocked(true);
                    }
                  }}
                  autoComplete="one-time-code"
                  autoFocus
                  className="lockdown-input h-12 px-3 text-center font-mono text-base font-black uppercase tracking-[0.22em] outline-none"
                  placeholder="XXXXXX-XXXXXX-XXXXXX"
                  type="password"
                />
              </label>
              <button
                type="button"
                disabled={code.trim().length < 8}
                onClick={() => setUnlocked(true)}
                className="group relative flex h-12 items-center justify-center gap-2 overflow-hidden border border-red-300 bg-red-700 px-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="absolute inset-0 translate-x-[-110%] bg-gradient-to-r from-transparent via-white/35 to-transparent transition duration-700 group-hover:translate-x-[110%]" />
                <KeyRound className="size-5" aria-hidden="true" />
                <span>Zugang freigeben</span>
              </button>
            </div>

            <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-red-200 sm:grid-cols-3">
              <span className="border border-red-800 bg-black/35 px-3 py-2">
                Web versiegelt
              </span>
              <span className="border border-red-800 bg-black/35 px-3 py-2">
                Code via DM
              </span>
              <span className="border border-red-800 bg-black/35 px-3 py-2">
                <ShieldAlert className="mx-auto size-4" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function startEmergencySound() {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  try {
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.value = 520;
    lfo.type = "triangle";
    lfo.frequency.value = 1.15;
    lfoGain.gain.value = 340;
    gain.gain.value = 0.055;

    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    lfo.start();

    if (context.state === "suspended") {
      void context.resume();
    }

    return () => {
      oscillator.stop();
      lfo.stop();
      void context.close();
    };
  } catch {
    return null;
  }
}
