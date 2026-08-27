import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cache } from "react";
import { prisma } from "./prisma";
import type { SessionPayload } from "./types";
import type { User as PrismaUser } from "@prisma/client";

const DEFAULT_DEV_SECRET = "unigamalang-dev-secret-change-me-in-production-0123456789";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || DEFAULT_DEV_SECRET
);
const COOKIE_NAME = "unigamalang_session";

/**
 * Validate AUTH_SECRET at runtime (not at module load / build time).
 * Called once on the first auth request.
 */
let _secretValidated = false;
function validateSecret() {
  if (_secretValidated) return;
  _secretValidated = true;
  // Skip during `next build` (NEXT_PHASE is set by Next.js during builds)
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === DEFAULT_DEV_SECRET)
  ) {
    throw new Error(
      "[FATAL] AUTH_SECRET tidak boleh kosong atau menggunakan nilai default di production. " +
      "Set AUTH_SECRET ke random string >=32 karakter di environment variables."
    );
  }
}
const EMAIL_DOMAIN = "@unigamalang.ac.id";

export function isAllowedEmail(email: string): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(EMAIL_DOMAIN);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Wrapped in React `cache()` so that within a single render (layout + page +
// nested server components, or one API request handler) the JWT verification
// + DB liveness lookup happens at most once. Without this, every server
// component that needs the session re-runs the same Neon query.
export const getSession = cache(
  async (): Promise<SessionPayload | null> => {
    validateSecret();
    const token = cookies().get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = await verifySession(token);
    if (!payload) return null;
    // Reject sessions for deactivated accounts, and for tokens whose
    // sessionVersion is stale (role/unit/password changed since signing —
    // see User.sessionVersion). One DB lookup per request, but gives
    // near-immediate revocation instead of waiting out the 7-day JWT expiry.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { deletedAt: true, sessionVersion: true },
    });
    if (!user || user.deletedAt) return null;
    if ((payload.sessionVersion ?? 0) !== user.sessionVersion) return null;
    return payload;
  }
);

export async function setSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

export async function authenticate(
  email: string,
  password: string
): Promise<PrismaUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) return null;
  // Deactivated accounts (soft-deleted) cannot log in.
  if (user.deletedAt) return null;
  const ok = bcrypt.compareSync(password, user.passwordHash);
  return ok ? user : null;
}

/**
 * Self-service registration (POST /register). Deliberately does NOT accept
 * a `unitId` — letting a self-registered account declare its own unit was
 * the direct path to reading another unit's archives (audit finding T-01).
 * Every self-registered account starts with unitId: null and
 * authProvider: CREDENTIALS; a SUPER_ADMIN must assign the unit via
 * PATCH /api/users/[id]. This is distinct from SSO-provisioned accounts,
 * which are trusted to self-assign once via /setup-unit (see
 * /api/users/me/unit).
 */
export async function registerUser(params: {
  email: string;
  password: string;
  name: string;
}): Promise<PrismaUser> {
  if (!isAllowedEmail(params.email)) {
    throw new Error(`Hanya email ${EMAIL_DOMAIN} yang diizinkan`);
  }
  const existing = await prisma.user.findUnique({
    where: { email: params.email.toLowerCase() },
  });
  if (existing) {
    if (existing.deletedAt) {
      throw new Error("Email pernah terdaftar (akun dinonaktifkan). Hubungi administrator untuk aktivasi ulang.");
    }
    throw new Error("Email sudah terdaftar");
  }

  return prisma.user.create({
    data: {
      email: params.email.toLowerCase(),
      name: params.name,
      passwordHash: bcrypt.hashSync(params.password, 10),
      role: "USER",
      unitId: null,
      authProvider: "CREDENTIALS",
    },
  });
}

export function toSessionPayload(user: PrismaUser): SessionPayload {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    unitId: user.unitId,
    sessionVersion: user.sessionVersion,
  };
}

/**
 * Hash a password-reset token before it touches the database (audit M5,
 * 2026-08-27). The raw token only ever exists in the emailed link and in
 * memory during the request that issues/verifies it; User.resetToken stores
 * SHA-256(token) so that DB access (a backup, a dump, a leaked query log,
 * an internal tool reading the User table) cannot be used to take over an
 * account the way a plaintext token could. This is a lookup key, not a
 * secret an attacker needs to brute-force offline (it's 32 random bytes and
 * expires in 1h), so a fast hash is fine — no bcrypt/scrypt needed.
 */
export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const AUTH_COOKIE = COOKIE_NAME;
export const ALLOWED_EMAIL_DOMAIN = EMAIL_DOMAIN;
