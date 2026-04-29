import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "unigamalang-dev-secret-change-me-in-production-0123456789"
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
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
