import { NextResponse, type NextRequest } from "next/server";
import { auth, isAllowed } from "@/auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type Guard =
  | { ok: true; email: string }
  | { ok: false; response: NextResponse };

function deny(message: string, status: number): Guard {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

/**
 * Defence in depth. The proxy already gates these routes, but a route that
 * answers without checking is one matcher typo away from being public.
 *
 * Pass the request to also reject cross-site writes: the session cookie is
 * SameSite=lax so a browser should never send it on a cross-origin POST, and
 * this makes that guarantee explicit rather than inherited.
 */
export async function requireUser(request?: NextRequest): Promise<Guard> {
  const session = await auth();
  const email = session?.user?.email;

  if (!isAllowed(email)) return deny("Not signed in", 401);

  if (request && !SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    // Same-origin browser writes always send Origin; non-browser clients that
    // omit it entirely are allowed through, since they carry no ambient cookie
    // a third-party site could abuse.
    if (origin && origin !== request.nextUrl.origin) {
      return deny("Cross-site request rejected", 403);
    }
  }

  return { ok: true, email: email as string };
}
