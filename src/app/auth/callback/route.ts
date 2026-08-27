import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { SSO_STATE_COOKIE, exchangeCode } from "@/lib/sso-client";
import { prisma } from "@/lib/prisma";
import { isAllowedEmail, setSessionCookie, toSessionPayload } from "@/lib/auth";
import { audit } from "@/lib/audit";
import bcrypt from "bcryptjs";

function redirectWithClearedState(url: URL): NextResponse {
  const res = NextResponse.redirect(url);
  res.cookies.delete(SSO_STATE_COOKIE);
  return res;
}

/**
 * GET /auth/callback?code=xxx&state=xxx
 *
 * SSO callback — exchanges the authorization code for user info,
 * ensures the user exists locally, creates a local session, and
 * redirects to the dashboard.
 *
 * Security (audit B2, 2026-08-23):
 *   - `state` must match the value /auth/sso/start stored in a cookie
 *     before redirecting to the gateway. Without this, a login-CSRF is
 *     possible: an attacker starts their own SSO flow, captures the
 *     resulting `code`, and gets a victim to open
 *     /auth/callback?code=<attacker's code> — silently logging the victim
 *     into the attacker's identity.
 *   - The email must match the institutional domain (isAllowedEmail),
 *     same check every other auth path (login/register/create-user)
 *     already enforces. Without it, any email the gateway vouches for
 *     (misconfiguration, or the gateway itself being pointed at a
 *     different IdP) gets a local account.
 *   - `role` from the gateway is NEVER trusted for account creation — every
 *     SSO-provisioned account starts as USER regardless of what the
 *     gateway's `user.role` claim says. A misconfigured or compromised
 *     gateway must not be able to mint a SUPER_ADMIN. A real SUPER_ADMIN
 *     promotes the account afterwards via Dashboard → Pengguna.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(SSO_STATE_COOKIE)?.value;

  if (!code) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  if (
    !state ||
    !expectedState ||
    state.length !== expectedState.length ||
    !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
  ) {
    console.warn("[SSO callback] state mismatch — possible login CSRF attempt");
    return redirectWithClearedState(
      new URL("/login?error=sso_failed", req.nextUrl.origin)
    );
  }

  try {
    const tokenResponse = await exchangeCode(code);
    const ssoUser = tokenResponse.user;

    if (!isAllowedEmail(ssoUser.email)) {
      console.warn("[SSO callback] rejected non-institutional email:", ssoUser.email);
      return redirectWithClearedState(
        new URL("/login?error=sso_domain", req.nextUrl.origin)
      );
    }
    const normalisedEmail = ssoUser.email.toLowerCase();

    // Find or create local user matching the SSO identity
    let user = await prisma.user.findUnique({
      where: { email: normalisedEmail },
    });

    if (!user) {
      // Auto-create user from SSO identity. `role` is always USER — see
      // the security note above. Do not read `ssoUser.role` here.
      user = await prisma.user.create({
        data: {
          email: normalisedEmail,
          name: ssoUser.name,
          // Generate a random password hash — user authenticates via SSO
          passwordHash: bcrypt.hashSync(crypto.randomUUID(), 10),
          role: "USER",
          // Marks this account as institutionally-vouched-for, so it's
          // allowed to self-assign a unit once via /setup-unit (unlike a
          // self-registered CREDENTIALS account — see audit T-01).
          authProvider: "SSO",
        },
      });
    } else if (user.deletedAt) {
      // Deactivated user — don't allow SSO login
      return redirectWithClearedState(
        new URL("/login?error=deactivated", req.nextUrl.origin)
      );
    }

    // Create local session
    await setSessionCookie(toSessionPayload(user));
    await audit({
      action: "LOGIN",
      actorId: user.id,
      actorEmail: user.email,
      targetType: "Auth",
      targetId: user.id,
      metadata: { via: "sso" },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip"),
      userAgent: req.headers.get("user-agent"),
    });

    // SSO auto-created users have no unit assigned — redirect to setup page
    // so they can choose their unit before accessing the dashboard.
    const dest = user.unitId ? "/dashboard" : "/setup-unit";
    return redirectWithClearedState(new URL(dest, req.nextUrl.origin));
  } catch (error) {
    console.error("SSO callback error:", error);
    return redirectWithClearedState(
      new URL("/login?error=sso_failed", req.nextUrl.origin)
    );
  }
}
