import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_OAUTH_COOKIE,
  buildGoogleAuthUrl,
  googleAuthAvailable,
  googleRedirectUri,
  pkceChallenge,
  randomToken,
} from "@/lib/google-auth";

/**
 * GET /auth/google/start — begins "Masuk dengan Google".
 *
 * Generates this attempt's state (login-CSRF), nonce (ID-token replay) and
 * PKCE verifier, keeps them in a short-lived httpOnly cookie, and sends the
 * browser to Google. /auth/google/callback checks all three.
 */
export async function GET(req: NextRequest) {
  if (!googleAuthAvailable()) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();

  const res = NextResponse.redirect(
    buildGoogleAuthUrl({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      redirectUri: googleRedirectUri(req.nextUrl.origin),
      state,
      nonce,
      codeChallenge: pkceChallenge(verifier),
    })
  );
  res.cookies.set(GOOGLE_OAUTH_COOKIE, JSON.stringify({ state, nonce, verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/google",
    maxAge: 10 * 60,
  });
  return res;
}
