import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { validateNumberTemplate } from "@/lib/format";
import { TEMPLATE_2027 } from "@/lib/numbering-2027/catalog";
import { planApply, type ExistingRow } from "@/lib/numbering-2027/plan";
import { executePlan, prismaApplyOps } from "@/lib/numbering-2027/apply";
import type { Prisma } from "@prisma/client";

const POLICY_ID = 1;
const CONFIRM_WORD = "TERAPKAN";

type Db = Prisma.TransactionClient | typeof prisma;

async function loadExisting(db: Db): Promise<{ units: ExistingRow[]; letterTypes: ExistingRow[] }> {
  const [units, letterTypes] = await Promise.all([
    db.unit.findMany({
      select: { id: true, code: true, name: true, deletedAt: true, formatTemplate: true },
      orderBy: { code: "asc" },
    }),
    db.letterType.findMany({
      select: { id: true, code: true, name: true, deletedAt: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return { units, letterTypes };
}

function serialisePolicy(
  policy: { template: string; appliedAt: Date; appliedByEmail: string | null } | null
) {
  return policy
    ? {
        template: policy.template,
        appliedAt: policy.appliedAt.toISOString(),
        appliedByEmail: policy.appliedByEmail,
      }
    : null;
}

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 }) };
  }
  if (session.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Akses ditolak" }, { status: 403 }) };
  }
  return { session };
}

/**
 * GET /api/numbering/policy?template=... — dry run. Returns whether the 2027
 * rule has been applied and what applying `template` would change. Writes
 * nothing.
 */
export async function GET(req: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const policy = await prisma.numberingPolicy.findUnique({ where: { id: POLICY_ID } });
  const requested = new URL(req.url).searchParams.get("template")?.trim();
  const template = requested || policy?.template || TEMPLATE_2027;
  const existing = await loadExisting(prisma);

  return NextResponse.json({
    policy: serialisePolicy(policy),
    defaultTemplate: TEMPLATE_2027,
    template,
    templateError: validateNumberTemplate(template),
    plan: planApply({ ...existing, template }),
  });
}

const applySchema = z.object({
  template: z.string().trim().min(1).max(200),
  confirm: z.string(),
});

/**
 * POST /api/numbering/policy — apply the 2027 rule: rename/create the
 * catalog's units and letter types and set the unit template, in one
 * transaction. Idempotent. Rows outside the catalog are never modified, and
 * numbers already issued keep the codes stored on each archive.
 */
export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;
  const { session } = auth;

  const parsed = applySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }
  const { template, confirm } = parsed.data;
  const templateError = validateNumberTemplate(template);
  if (templateError) {
    return NextResponse.json({ error: templateError }, { status: 400 });
  }
  if (confirm !== CONFIRM_WORD) {
    return NextResponse.json({ error: `Ketik ${CONFIRM_WORD} untuk melanjutkan` }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const plan = planApply({ ...(await loadExisting(tx)), template });
        const summary = await executePlan(plan, prismaApplyOps(tx));
        const applied = { template, appliedAt: new Date(), appliedByEmail: session.email };
        const policy = await tx.numberingPolicy.upsert({
          where: { id: POLICY_ID },
          create: { id: POLICY_ID, ...applied },
          update: applied,
        });
        await audit(
          {
            action: "UPDATE",
            actorId: session.userId,
            actorEmail: session.email,
            targetType: "NumberingPolicy",
            targetId: String(POLICY_ID),
            metadata: {
              template,
              summary: { ...summary },
              untouchedUnits: plan.untouchedUnits.map((u) => u.code),
              untouchedLetterTypes: plan.untouchedLetterTypes.map((t) => t.code),
            },
          },
          tx
        );
        return { policy, summary, plan };
      },
      // Up to ~60 sequential writes over a pooled connection; the 5 s
      // default is too tight.
      { maxWait: 10_000, timeout: 30_000 }
    );

    return NextResponse.json({
      policy: serialisePolicy(result.policy),
      summary: result.summary,
      plan: result.plan,
    });
  } catch (err) {
    // Log the detail server-side only; Prisma messages leak schema names.
    // eslint-disable-next-line no-console
    console.error("[/api/numbering/policy POST] failed", err);
    return NextResponse.json(
      { error: "Gagal menerapkan aturan penomoran. Tidak ada yang diubah. Coba lagi atau periksa log server." },
      { status: 500 }
    );
  }
}
