import { beforeEach, describe, expect, it, vi } from "vitest";

// The route's collaborators that touch the outside world (session cookie,
// database, audit log) are replaced; the route's own rules run for real.
// (auth.ts itself can't load here: it uses React's server-only cache().)
const { session, created } = vi.hoisted(() => ({
  session: { current: null as null | { userId: string; email: string; role: string } },
  created: [] as unknown[],
}));
vi.mock("@/lib/auth", () => ({
  ALLOWED_EMAIL_DOMAIN: "@unigamalang.ac.id",
  isAllowedEmail: (e: string) => e.toLowerCase().endsWith("@unigamalang.ac.id"),
  getSession: async () => session.current,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: "new", createdAt: new Date(), ...data };
      }),
    },
    unit: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

function post(body: unknown) {
  return new Request("http://localhost/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const account = {
  name: "Hari Setiawan",
  email: "Rhari.Setiawan@gmail.com",
  password: "Rahasia123",
  role: "SUPER_ADMIN",
  unitId: null,
};

beforeEach(() => {
  created.length = 0;
});

describe("POST /api/users with a personal email", () => {
  it("lets Super Admin create an account on a personal email", async () => {
    session.current = { userId: "sa", email: "superadmin@unigamalang.ac.id", role: "SUPER_ADMIN" };
    const { POST } = await import("@/app/api/users/route");
    const res = await POST(post(account));
    expect(res.status).toBe(201);
    expect(created[0]).toMatchObject({ email: "rhari.setiawan@gmail.com", role: "SUPER_ADMIN" });
  });

  it("still refuses anyone who is not Super Admin", async () => {
    session.current = { userId: "au", email: "admin.feb@unigamalang.ac.id", role: "ADMIN_UNIT" };
    const { POST } = await import("@/app/api/users/route");
    const res = await POST(post(account));
    expect(res.status).toBe(403);
    expect(created).toHaveLength(0);
  });
});
