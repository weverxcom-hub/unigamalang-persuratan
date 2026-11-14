/**
 * "Masuk dengan Google" — Google OpenID Connect, authorization-code flow
 * with PKCE, state and nonce. Used by /auth/google/start and
 * /auth/google/callback.
 *
 * Who may sign in (decideGoogleLogin):
 *   - Only accounts that ALREADY exist in this app. Google sign-in never
 *     creates an account: staff accounts are created by Super Admin (and
 *     assigned a unit by the PIC), so an unknown email is refused.
 *   - Google must have verified the email.
 *   - An @unigamalang.ac.id address must come from the campus Google
 *     Workspace (`hd` claim). Without this, anyone could create a consumer
 *     Google account on a campus address they don't own.
 *   - Any other (personal) email works only because Super Admin created an
 *     account for exactly that address.
 *
 * Environment:
 *   GOOGLE_OAUTH_CLIENT_ID      — OAuth client (Web application) from
 *   GOOGLE_OAUTH_CLIENT_SECRET    Google Cloud Console.
 *   The redirect URI is <site origin>/auth/google/callback and must be
 *   registered on that client for every domain the app runs on.
 */
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const GOOGLE_OAUTH_COOKIE = "google_oauth";
const CAMPUS_DOMAIN = "unigamalang.ac.id";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export function googleAuthAvailable(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function googleRedirectUri(origin: string): string {
  return `${origin}/auth/google/callback`;
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function buildGoogleAuthUrl(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Exchange the authorization code for Google's ID token. */
export async function exchangeGoogleCode(p: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: p.code,
      code_verifier: p.codeVerifier,
      redirect_uri: p.redirectUri,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !data.id_token) {
    throw new Error(`Google token exchange failed (${res.status} ${data.error ?? ""})`);
  }
  return data.id_token;
}

export interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  hd?: string;
  name?: string;
}

let googleJwks: JWTVerifyGetKey | null = null;
function defaultJwks(): JWTVerifyGetKey {
  googleJwks ??= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  return googleJwks;
}

/**
 * Verify the ID token's signature (Google's published keys), issuer,
 * audience (our client), expiry and the nonce of this login attempt.
 * Throws when any check fails.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { clientId: string; nonce: string; jwks?: JWTVerifyGetKey }
): Promise<GoogleClaims> {
  const { payload } = await jwtVerify(idToken, opts.jwks ?? defaultJwks(), {
    issuer: GOOGLE_ISSUERS,
    audience: opts.clientId,
  });
  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, opts.nonce)) {
    throw new Error("Google ID token nonce mismatch");
  }
  if (typeof payload.email !== "string" || typeof payload.sub !== "string") {
    throw new Error("Google ID token has no email");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    hd: typeof payload.hd === "string" ? payload.hd : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}

export type GoogleLoginDecision =
  | { ok: true; userId: string }
  | { ok: false; reason: "unverified" | "not_registered" | "deactivated" | "domain" };

export function decideGoogleLogin(
  claims: GoogleClaims,
  user: { id: string; deletedAt: Date | null } | null
): GoogleLoginDecision {
  if (!claims.emailVerified) return { ok: false, reason: "unverified" };
  if (!user) return { ok: false, reason: "not_registered" };
  if (user.deletedAt) return { ok: false, reason: "deactivated" };
  const isCampusAddress = claims.email.toLowerCase().endsWith(`@${CAMPUS_DOMAIN}`);
  if (isCampusAddress && claims.hd?.toLowerCase() !== CAMPUS_DOMAIN) {
    return { ok: false, reason: "domain" };
  }
  return { ok: true, userId: user.id };
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
