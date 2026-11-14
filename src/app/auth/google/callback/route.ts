import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_OAUTH_COOKIE,
  decideGoogleLogin,
  exchangeGoogleCode,
  googleAuthAvailable,
  googleRedirectUri,
  safeEqual,
  verifyGoogleIdToken,
} from "@/lib/google-auth";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, toSessionPayload } from "@/lib/auth";
import { audit } from "@/lib/audit";

function finish(req: NextRequest, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, req.nextUrl.origin));
  res.cookies.set(GOOGLE_OAUTH_COOKIE, "", { path: "/auth/google", maxAge: 0 });
  return res;
}

function readAttempt(raw: string | undefined): { state: string; nonce: string; verifier: string } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.state === "string" && typeof v?.nonce === "string" && typeof v?.verifier === "string") {
      return v;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * GET /auth/google/callback?code=…&state=…
 *
 * Completes "Masuk dengan Google": checks state against the cookie set by
 * /auth/google/start, exchanges the code (with the PKCE verifier), verifies
 * the ID token (signature, issuer, audience, expiry, nonce), then signs in
 * the matching EXISTING account. See decideGoogleLogin for who is allowed.
 */
export async function GET(req: NextRequest) {
  if (!googleAuthAvailable()) return finish(req, "/login");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const attempt = readAttempt(req.cookies.get(GOOGLE_OAUTH_COOKIE)?.value);

  // User pressed "Cancel" on Google's screen, or the link is stale.
  if (!code) return finish(req, "/login?error=google_cancelled");
  if (!state || !attempt || !safeEqual(state, attempt.state)) {
    console.warn("[Google login] state mismatch — possible login CSRF attempt");
    return finish(req, "/login?error=google_failed");
  }

  try {
    const idToken = await exchangeGoogleCode({
      code,
      codeVerifier: attempt.verifier,
      redirectUri: googleRedirectUri(req.nextUrl.origin),
    });
    const claims = await verifyGoogleIdToken(idToken, {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      nonce: attempt.nonce,
    });

    const email = claims.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const decision = decideGoogleLogin(claims, user);
    if (!decision.ok || !user) {
      const reason = decision.ok ? "not_registered" : decision.reason;
      console.warn(`[Google login] refused (${reason}):`, email);
      return finish(req, `/login?error=google_${reason}`);
    }

    await setSessionCookie(toSessionPayload(user));
    await audit({
      action: "LOGIN",
      actorId: user.id,
      actorEmail: user.email,
      targetType: "Auth",
      targetId: user.id,
      metadata: { via: "google" },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip"),
      userAgent: req.headers.get("user-agent"),
    });
    return finish(req, "/dashboard");
  } catch (error) {
    console.error("[Google login] error:", error);
    return finish(req, "/login?error=google_failed");
  }
}
