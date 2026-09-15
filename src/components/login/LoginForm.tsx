"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { IconArrowLeft, IconLoader2, IconMail } from "@tabler/icons-react";

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
          className="text-muted-foreground block text-[10px] font-medium tracking-[0.18em] uppercase"
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
          className="border-input focus:ring-ring/50 placeholder:text-muted-foreground mt-1.5 h-8 w-full border bg-transparent px-2 text-[12px] outline-none focus:ring-1"
        />

        {error && <Banner tone="error">{error}</Banner>}

        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="bg-primary text-primary-foreground ks-transition mt-4 inline-flex h-8 w-full items-center justify-center gap-1.5 text-[12px] font-medium hover:opacity-90 disabled:opacity-40"
        >
          {busy ? (
            <IconLoader2 size={14} stroke={1.75} className="animate-spin" />
          ) : (
            <IconMail size={14} stroke={1.75} />
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
        className="text-muted-foreground block text-[10px] font-medium tracking-[0.18em] uppercase"
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
        className="border-input focus:ring-ring/50 placeholder:text-muted-foreground mt-1.5 h-10 w-full border bg-transparent text-center font-mono text-[16px] tracking-[0.4em] outline-none focus:ring-1"
      />

      <p className="text-muted-foreground mt-2 text-[12px]">
        Sent to <span className="text-foreground font-mono">{email.trim().toLowerCase()}</span>
      </p>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="bg-primary text-primary-foreground ks-transition mt-4 inline-flex h-8 w-full items-center justify-center gap-1.5 text-[12px] font-medium hover:opacity-90 disabled:opacity-40"
      >
        {busy && <IconLoader2 size={14} stroke={1.75} className="animate-spin" />}
        Sign in
      </button>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setError(null);
            setNotice(null);
          }}
          className="text-muted-foreground hover:bg-accent hover:text-foreground ks-transition inline-flex h-7 items-center gap-1.5 px-2 text-[12px]"
        >
          <IconArrowLeft size={12} stroke={1.75} />
          Change email
        </button>
        <button
          type="button"
          disabled={busy || secondsLeft > 0}
          onClick={() => void requestCode(true)}
          className="text-muted-foreground hover:bg-accent hover:text-foreground ks-transition h-7 px-2 text-[12px] disabled:opacity-40 disabled:hover:bg-transparent"
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
      className={`mt-3 border px-3 py-2 text-[12px] leading-5 ${
        tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-primary/30 bg-primary/10 text-foreground"
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
