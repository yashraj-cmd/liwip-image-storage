"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestCode(resend = false) {
    const address = email.trim().toLowerCase();
    if (!address) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not send the code.");

      setStep("code");
      setSecondsLeft(30);
      if (resend) setNotice("A new code is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await signIn("otp", { code, redirect: false });
      if (result?.error) {
        setError("That code is not right, or it has expired.");
        setCode("");
        codeRef.current?.focus();
        return;
      }
      // Full load so the proxy runs and the library renders signed in.
      // Only same-site paths are honoured: a callbackUrl pointing at another
      // host would hand a freshly authenticated user to an attacker.
      window.location.href = safeCallback(callbackUrl);
    } catch {
      setError("Could not sign you in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void requestCode();
        }}
      >
        <label
          htmlFor="email"
          className="block text-[11px] font-medium tracking-[0.14em] text-[#6f6f6f] uppercase"
        >
          Work email
        </label>
        <input
          id="email"
          type="email"
          autoFocus
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@keystonecommerce.in"
          className="mt-2.5 h-11 w-full rounded-full bg-[#0a0a0a] px-4 text-[14px] text-white ring-1 ring-[#2a2a2a] outline-none placeholder:text-[#6f6f6f] focus:ring-[#0e7a5c]/60"
        />

        {error && <Banner tone="error">{error}</Banner>}

        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-[#0e7a5c] text-[14px] font-medium text-white hover:bg-[#10956e] disabled:bg-[#1b3d33] disabled:text-[#6f8f84]"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Mail className="size-4" strokeWidth={1.5} />
          )}
          Email me a code
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void verify();
      }}
    >
      <label
        htmlFor="code"
        className="block text-[11px] font-medium tracking-[0.14em] text-[#6f6f6f] uppercase"
      >
        Six digit code
      </label>
      <input
        id="code"
        ref={codeRef}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(next);
          setError(null);
        }}
        placeholder="000000"
        className="mt-2.5 h-11 w-full rounded-full bg-[#0a0a0a] px-4 text-center text-[20px] tracking-[0.4em] text-white ring-1 ring-[#2a2a2a] outline-none placeholder:text-[#3a3a3a] focus:ring-[#0e7a5c]/60"
      />

      <p className="mt-3 px-1 text-[12px] leading-5 text-[#9a9a9a]">
        Sent to <span className="text-[#d0d0d0]">{email.trim().toLowerCase()}</span>
      </p>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-[#0e7a5c] text-[14px] font-medium text-white hover:bg-[#10956e] disabled:bg-[#1b3d33] disabled:text-[#6f8f84]"
      >
        {busy && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
        Sign in
      </button>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setError(null);
            setNotice(null);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-[#cfcfcf] hover:bg-[#1a1a1a]"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Change email
        </button>
        <button
          type="button"
          disabled={busy || secondsLeft > 0}
          onClick={() => void requestCode(true)}
          className="h-9 rounded-full px-3 text-[13px] text-[#cde8df] hover:bg-[#1a1a1a] disabled:text-[#5a5a5a] disabled:hover:bg-transparent"
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

function Banner({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  return (
    <div
      className={`mt-5 rounded-2xl px-4 py-2.5 text-[13px] leading-6 ${
        tone === "error" ? "bg-[#2a1212] text-[#f0b4b4]" : "bg-[#0e7a5c]/20 text-[#cde8df]"
      }`}
    >
      {children}
    </div>
  );
}

/** A relative path, never an absolute or protocol-relative URL. */
function safeCallback(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  // Guard against "/\evil.com", which some browsers treat as protocol-relative.
  if (value.startsWith("/\\")) return "/";
  return value;
}
