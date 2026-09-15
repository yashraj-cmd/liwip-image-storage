import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import {
  OTP_COOKIE,
  OTP_MAX_ATTEMPTS,
  hashCode,
  openChallenge,
  safeEqual,
  sealChallenge,
} from "@/lib/otp";

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

const allowedEmails = list(process.env.AUTH_ALLOWED_EMAILS);
const allowedDomains = list(process.env.AUTH_ALLOWED_DOMAINS);

/** True when the access list has been configured at all. */
export const accessConfigured = allowedEmails.length > 0 || allowedDomains.length > 0;

/**
 * Fails closed: with no allow list configured nobody gets in, so a misdeployed
 * instance is locked rather than open to anyone who can receive an email.
 */
export function isAllowed(email: string | null | undefined): boolean {
  if (!email || !accessConfigured) return false;

  const normalized = email.toLowerCase();
  if (allowedEmails.includes(normalized)) return true;

  const domain = normalized.split("@")[1];
  return Boolean(domain) && allowedDomains.includes(domain);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Default is 30 days, which is a long time for a credential that can delete
  // the whole library. A week, refreshed on use.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      id: "otp",
      name: "Email code",
      credentials: { code: {} },
      async authorize(credentials) {
        const code = String(credentials?.code ?? "").trim();
        if (!/^\d{6}$/.test(code)) return null;

        const store = await cookies();
        const challenge = await openChallenge(store.get(OTP_COOKIE)?.value);
        if (!challenge || !isAllowed(challenge.email)) return null;

        if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
          store.delete(OTP_COOKIE);
          return null;
        }

        const candidate = await hashCode(challenge.email, code);
        if (!safeEqual(candidate, challenge.hash)) {
          // Burn an attempt so a wrong code cannot be retried forever.
          store.set(
            OTP_COOKIE,
            await sealChallenge({ ...challenge, attempts: challenge.attempts + 1 }),
            { httpOnly: true, sameSite: "lax", path: "/" },
          );
          return null;
        }

        // One code, one sign-in.
        store.delete(OTP_COOKIE);
        return { id: challenge.email, email: challenge.email, name: null, image: null };
      },
    }),
  ],
  callbacks: {
    signIn({ user }) {
      return isAllowed(user?.email);
    },
  },
});
