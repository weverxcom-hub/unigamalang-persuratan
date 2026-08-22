import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/sso-client";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, toSessionPayload } from "@/lib/auth";
import bcrypt from "bcryptjs";

/**
 * GET /auth/callback?code=xxx&state=xxx
 *
 * SSO callback — exchanges the authorization code for user info,
 * ensures the user exists locally, creates a local session, and
 * redirects to the dashboard.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  try {
    const tokenResponse = await exchangeCode(code);
    const ssoUser = tokenResponse.user;

    // Find or create local user matching the SSO identity
    let user = await prisma.user.findUnique({
      where: { email: ssoUser.email },
    });

    if (!user) {
      // Auto-create user from SSO identity
      user = await prisma.user.create({
        data: {
          email: ssoUser.email,
          name: ssoUser.name,
          // Generate a random password hash — user authenticates via SSO
          passwordHash: bcrypt.hashSync(crypto.randomUUID(), 10),
          role: (ssoUser.role as "SUPER_ADMIN" | "ADMIN_UNIT" | "USER") || "USER",
          // Marks this account as institutionally-vouched-for, so it's
          // allowed to self-assign a unit once via /setup-unit (unlike a
          // self-registered CREDENTIALS account — see audit T-01).
          authProvider: "SSO",
        },
      });
    } else if (user.deletedAt) {
      // Deactivated user — don't allow SSO login
      return NextResponse.redirect(
        new URL("/login?error=deactivated", req.nextUrl.origin)
      );
    }

    // Create local session
    await setSessionCookie(toSessionPayload(user));

    // SSO auto-created users have no unit assigned — redirect to setup page
    // so they can choose their unit before accessing the dashboard.
    if (!user.unitId) {
      return NextResponse.redirect(new URL("/setup-unit", req.nextUrl.origin));
    }

    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  } catch (error) {
    console.error("SSO callback error:", error);
    return NextResponse.redirect(
      new URL("/login?error=sso_failed", req.nextUrl.origin)
    );
  }
}
