import { NextResponse } from "next/server";
import { auth, isAllowed } from "@/auth";

export default auth((request) => {
  if (isAllowed(request.auth?.user?.email)) return;

  const { pathname, search } = request.nextUrl;

  // API callers get a status they can act on rather than a login page they
  // would try to parse as JSON.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const login = new URL("/login", request.nextUrl.origin);
  login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
});

export const config = {
  // Everything except the sign-in page, the auth endpoints and static assets.
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|liwip-logo.png|liwip-wordmark.png).*)",
  ],
};
