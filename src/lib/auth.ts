import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getDb, saveDb, uid } from "./db";
import type { Role, SessionPayload, User } from "./types";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "unigamalang-dev-secret-change-me-in-production-0123456789"
);
const COOKIE_NAME = "unigamalang_session";
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

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySession(token);
}

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

export async function authenticate(email: string, password: string): Promise<User | null> {
  const db = getDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  const ok = bcrypt.compareSync(password, user.passwordHash);
  return ok ? user : null;
}

export function registerUser(params: {
  email: string;
  password: string;
  name: string;
  unitId: string | null;
  role?: Role;
}): User {
  const db = getDb();
  if (db.users.some((u) => u.email.toLowerCase() === params.email.toLowerCase())) {
    throw new Error("Email sudah terdaftar");
  }
  if (!isAllowedEmail(params.email)) {
    throw new Error(`Hanya email ${EMAIL_DOMAIN} yang diizinkan`);
  }
  const user: User = {
    id: uid("user"),
    email: params.email,
    name: params.name,
    passwordHash: bcrypt.hashSync(params.password, 10),
    role: params.role ?? "USER",
    unitId: params.unitId,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  saveDb(db);
  return user;
}

export function toSessionPayload(user: User): SessionPayload {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    unitId: user.unitId,
  };
}

export const AUTH_COOKIE = COOKIE_NAME;
export const ALLOWED_EMAIL_DOMAIN = EMAIL_DOMAIN;
