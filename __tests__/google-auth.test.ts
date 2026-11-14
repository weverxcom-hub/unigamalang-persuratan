import { describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import {
  buildGoogleAuthUrl,
  decideGoogleLogin,
  pkceChallenge,
  verifyGoogleIdToken,
  type GoogleClaims,
} from "@/lib/google-auth";

const CLIENT_ID = "client-123.apps.googleusercontent.com";

describe("pkceChallenge", () => {
  it("matches the RFC 7636 example (S256)", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });
});

describe("buildGoogleAuthUrl", () => {
  it("asks Google for an authorization code with state, nonce and PKCE", () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: CLIENT_ID,
        redirectUri: "https://surat.unigamalang.ac.id/auth/google/callback",
        state: "st",
        nonce: "no",
        codeChallenge: "ch",
      })
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe(CLIENT_ID);
    expect(p.get("redirect_uri")).toBe("https://surat.unigamalang.ac.id/auth/google/callback");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe("openid email profile");
    expect(p.get("state")).toBe("st");
    expect(p.get("nonce")).toBe("no");
    expect(p.get("code_challenge")).toBe("ch");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("prompt")).toBe("select_account");
  });
});

async function signer() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  async function sign(claims: Record<string, unknown>, opts: { exp?: string | number } = {}) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(privateKey);
  }
  return { jwks, sign };
}

const good = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "1001",
  email: "budi@unigamalang.ac.id",
  email_verified: true,
  hd: "unigamalang.ac.id",
  name: "Budi",
  nonce: "n-1",
};

describe("verifyGoogleIdToken", () => {
  it("returns the claims of a valid Google ID token", async () => {
    const { jwks, sign } = await signer();
    const claims = await verifyGoogleIdToken(await sign(good), {
      clientId: CLIENT_ID,
      nonce: "n-1",
      jwks,
    });
    expect(claims).toMatchObject({
      email: "budi@unigamalang.ac.id",
      emailVerified: true,
      hd: "unigamalang.ac.id",
      name: "Budi",
      sub: "1001",
    });
  });

  it("rejects a token issued for another app", async () => {
    const { jwks, sign } = await signer();
    const token = await sign({ ...good, aud: "someone-else" });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: "n-1", jwks })).rejects.toThrow();
  });

  it("rejects a token not issued by Google", async () => {
    const { jwks, sign } = await signer();
    const token = await sign({ ...good, iss: "https://evil.example" });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: "n-1", jwks })).rejects.toThrow();
  });

  it("rejects a token whose nonce does not match this login attempt", async () => {
    const { jwks, sign } = await signer();
    const token = await sign({ ...good, nonce: "other" });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: "n-1", jwks })).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const { jwks, sign } = await signer();
    const token = await sign(good, { exp: Math.floor(Date.now() / 1000) - 600 });
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: "n-1", jwks })).rejects.toThrow();
  });
});

const claims = (over: Partial<GoogleClaims> = {}): GoogleClaims => ({
  sub: "1001",
  email: "budi@unigamalang.ac.id",
  emailVerified: true,
  hd: "unigamalang.ac.id",
  name: "Budi",
  ...over,
});
const user = (over: Partial<{ id: string; email: string; deletedAt: Date | null }> = {}) => ({
  id: "u1",
  email: "budi@unigamalang.ac.id",
  deletedAt: null as Date | null,
  ...over,
});

describe("decideGoogleLogin", () => {
  it("lets a registered campus Google Workspace account in", () => {
    expect(decideGoogleLogin(claims(), user())).toEqual({ ok: true, userId: "u1" });
  });

  it("refuses an email Google has not verified", () => {
    expect(decideGoogleLogin(claims({ emailVerified: false }), user())).toEqual({ ok: false, reason: "unverified" });
  });

  it("refuses an email that has no account in the system", () => {
    expect(decideGoogleLogin(claims(), null)).toEqual({ ok: false, reason: "not_registered" });
  });

  it("refuses a deactivated account", () => {
    expect(decideGoogleLogin(claims(), user({ deletedAt: new Date() }))).toEqual({ ok: false, reason: "deactivated" });
  });

  it("refuses a campus address that is not a campus Google Workspace account", () => {
    expect(decideGoogleLogin(claims({ hd: undefined }), user())).toEqual({ ok: false, reason: "domain" });
  });

  it("lets a personal Google account in when Super Admin created an account for it", () => {
    const personal = "rhari.setiawan@gmail.com";
    expect(
      decideGoogleLogin(claims({ email: personal, hd: undefined }), user({ email: personal }))
    ).toEqual({ ok: true, userId: "u1" });
  });
});
