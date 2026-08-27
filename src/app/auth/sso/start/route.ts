import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { SSO_STATE_COOKIE, buildAuthorizeUrl, ssoAvailable } from "@/lib/sso-client";

/**
 * GET /auth/sso/start
 *
 * Kicks off the SSO login flow. Generates a random `state`, stores it in a
 * short-lived httpOnly cookie, and redirects to the gateway's /authorize
 * endpoint with that state attached.
 *
 * Why this route exists instead of building the authorize URL directly in
 * /login (a Server Component): Server Components cannot set cookies (only
 * Server Actions / Route Handlers can), and the state needs to be stored
 * somewhere the callback can verify against — a cookie is the standard
 * approach for OAuth-style login CSRF protection (audit B2, 2026-08-23).
 * Without this, an attacker could craft their own `code` at the gateway
 * and trick a victim into visiting /auth/callback?code=... , silently
 * logging the victim into the attacker's SSO identity (login CSRF).
 */
export async function GET(req: NextRequest) {
  if (!ssoAvailable()) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const state = crypto.randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set(SSO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60, // 10 minutes — long enough for the gateway round-trip, short enough to limit replay
  });
  return res;
}
