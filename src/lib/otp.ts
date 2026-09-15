import { SignJWT, jwtVerify } from "jose";

export const OTP_COOKIE = "sku_otp";
export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpChallenge = {
  email: string;
  hash: string;
  attempts: number;
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(value);
}

/** Six digits, uniformly distributed, from the platform CSPRNG. */
export function generateCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

/**
 * The code never leaves the server in readable form: only this hash is stored
 * in the challenge cookie, so a stolen cookie does not reveal the code.
 */
export async function hashCode(email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(
    `${email.toLowerCase()}:${code}:${process.env.AUTH_SECRET ?? ""}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison, so timing cannot leak the expected hash. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export async function sealChallenge(challenge: OtpChallenge): Promise<string> {
  return new SignJWT({ ...challenge })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OTP_TTL_SECONDS}s`)
    .sign(secret());
}

export async function openChallenge(token: string | undefined): Promise<OtpChallenge | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const { email, hash, attempts } = payload as Record<string, unknown>;
    if (typeof email !== "string" || typeof hash !== "string") return null;
    return { email, hash, attempts: typeof attempts === "number" ? attempts : 0 };
  } catch {
    // Expired or tampered with; treat both as no challenge at all.
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: OTP_TTL_SECONDS,
};
