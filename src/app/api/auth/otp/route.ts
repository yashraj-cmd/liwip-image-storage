import { NextRequest, NextResponse } from "next/server";
import { accessConfigured, isAllowed } from "@/auth";
import { mailConfigured, sendOtpEmail } from "@/lib/mailer";
import {
  OTP_COOKIE,
  cookieOptions,
  generateCode,
  hashCode,
  sealChallenge,
} from "@/lib/otp";

export const runtime = "nodejs";

const RESEND_INTERVAL_MS = 30_000;
/** Per-process only; a multi-instance deployment needs a shared store. */
const lastSent = new Map<string, number>();

export async function POST(request: NextRequest) {
  try {
    if (!accessConfigured) {
      return NextResponse.json(
        { error: "Sign-in is not configured on this server." },
        { status: 503 },
      );
    }
    if (!mailConfigured && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Email delivery is not configured on this server." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { email?: string };
    const email = String(body.email ?? "").trim().toLowerCase();

    // Always answer the same way, so this cannot be used to discover which
    // addresses are on the access list.
    const generic = NextResponse.json({ ok: true });

    if (!email || !isAllowed(email)) return generic;

    const previous = lastSent.get(email) ?? 0;
    if (Date.now() - previous < RESEND_INTERVAL_MS) {
      return NextResponse.json(
        { error: "A code was just sent. Wait a moment before asking for another." },
        { status: 429 },
      );
    }
    lastSent.set(email, Date.now());

    const code = generateCode();
    await sendOtpEmail(email, code);

    generic.cookies.set(
      OTP_COOKIE,
      await sealChallenge({ email, hash: await hashCode(email, code), attempts: 0 }),
      cookieOptions,
    );

    return generic;
  } catch (error) {
    console.error("Failed to send sign-in code", error);
    return NextResponse.json(
      { error: "Could not send the code. Try again." },
      { status: 500 },
    );
  }
}
