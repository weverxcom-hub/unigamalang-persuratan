import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const DEFAULT_DEV_SECRET = "unigamalang-dev-secret-change-me-in-production-0123456789";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || DEFAULT_DEV_SECRET
);
const COOKIE_NAME = "unigamalang_session";

async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── CSRF protection: verify Origin / Referer on state-changing requests ──
  // sameSite=lax covers most CSRF vectors, but explicit Origin checking adds
  // defense-in-depth for API mutations.
  if (
    pathname.startsWith("/api/") &&
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    req.method !== "OPTIONS"
  ) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json(
            { error: "Permintaan lintas asal tidak diizinkan" },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Header Origin tidak valid" },
          { status: 403 }
        );
      }
    }
  }

  // ── Auth guard ──
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const valid = await isValidSession(token);

  const isProtectedRoute = pathname.startsWith("/dashboard");

  if (isProtectedRoute && !valid) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Redirecting authenticated users away from /login and /register is handled
  // by those pages themselves (via getSession, which also rejects deactivated
  // accounts). Doing it here would cause a redirect loop for soft-deleted
  // users whose JWT is still cryptographically valid: the dashboard layout's
  // getSession would redirect to /login, but the middleware would then
  // redirect right back to /dashboard.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/auth/:path*", "/api/:path*"],
};
