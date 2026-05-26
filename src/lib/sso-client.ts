/**
 * SSO Client — handles communication with the UNIGA SSO Gateway.
 *
 * Environment variables required:
 *   SSO_BASE_URL       — e.g. https://sso.unigamalang.ac.id (or http://localhost:3000 for dev)
 *   SSO_CLIENT_ID      — registered client_id, e.g. "persuratan"
 *   SSO_CLIENT_SECRET  — client secret received during app registration
 *   SSO_REDIRECT_URI   — this app's callback URL, e.g. http://localhost:3001/auth/callback
 */

export function getSSOConfig() {
  const baseUrl = process.env.SSO_BASE_URL;
  const clientId = process.env.SSO_CLIENT_ID;
  const clientSecret = process.env.SSO_CLIENT_SECRET;
  const redirectUri = process.env.SSO_REDIRECT_URI;

  if (!baseUrl || !clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing SSO config. Set SSO_BASE_URL, SSO_CLIENT_ID, SSO_CLIENT_SECRET, SSO_REDIRECT_URI"
    );
  }

  return { baseUrl, clientId, clientSecret, redirectUri };
}

/** Build the URL to redirect the user to for SSO login. */
export function buildAuthorizeUrl(state?: string): string {
  const { baseUrl, clientId, redirectUri } = getSSOConfig();
  const url = new URL("/authorize", baseUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export interface SSOTokenResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string | null;
  };
}

/** Exchange an authorization code for an access token + user info. */
export async function exchangeCode(code: string): Promise<SSOTokenResponse> {
  const { baseUrl, clientId, clientSecret } = getSSOConfig();

  const res = await fetch(`${baseUrl}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `SSO token exchange failed (${res.status})`);
  }

  return res.json();
}
