import { beforeEach, describe, expect, it, vi } from "vitest";

// Session, database and audit log are replaced; the routes' own rules and the
// real access functions run for real. The prisma mock deliberately has no
// `archive` or `numberingSequence` key, so any accidental touch throws.
type TestSession = {
  userId: string;
  email: string;
  name: string;
  role: string;
  unitId: string | null;
  sessionVersion: number;
};
const { session, db } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
  db: {
    legacyDecree: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    unit: { findFirst: vi.fn() },
    letterType: { findFirst: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ getSession: async () => session.current }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { audit } from "@/lib/audit";
import { GET as listGET, POST as createPOST } from "@/app/api/arsip-lama/route";
import { GET as detailGET, PATCH as detailPATCH } from "@/app/api/arsip-lama/[id]/route";
import { POST as withdrawPOST } from "@/app/api/arsip-lama/[id]/withdraw/route";

const auditMock = vi.mocked(audit);

function as(role: string, unitId: string | null, userId = "u1"): TestSession {
  return { userId, email: `${userId}@unigamalang.ac.id`, name: "Tester", role, unitId, sessionVersion: 1 };
}
const unitAdminFeb = () => as("ADMIN_UNIT", "feb", "au");
const superAdmin = () => as("SUPER_ADMIN", null, "sa");

function req(method: string, url: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id = "r1") => ({ params: Promise.resolve({ id }) });

const validBody = {
  letterTypeId: "lt",
  unitId: "feb",
  direction: "OUTGOING",
  nomor: "",
  tanggal: null,
  tanggalRaw: "",
  perihal: "Undangan rapat senat",
  counterpart: null,
  physicalLocation: null,
  physicalKind: "ASLI",
  confidential: false,
  catatan: null,
};

function record(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    unitId: "feb",
    unitLabelRaw: "FEB",
    letterTypeId: "lt",
    letterType: { code: "ST", name: "Surat Tugas" },
    direction: "OUTGOING",
    nomor: "001/ST/FEB/I/1998",
    tanggal: new Date("1998-03-14"),
    tanggalRaw: "14 Maret 1998",
    perihal: "Perihal lama",
    counterpart: null,
    physicalLocation: null,
    physicalKind: "ASLI",
    confidential: false,
    catatan: null,
    isPublic: false,
    withdrawnAt: null,
    files: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.current = null;
  db.unit.findFirst.mockResolvedValue({ id: "feb", name: "Fakultas Ekonomi dan Bisnis" });
  db.letterType.findFirst.mockResolvedValue({ id: "lt" });
  db.legacyDecree.create.mockResolvedValue({ id: "new1" });
  db.legacyDecree.findMany.mockResolvedValue([]);
  db.legacyDecree.count.mockResolvedValue(0);
  db.legacyDecree.update.mockResolvedValue({});
  db.auditLog.findMany.mockResolvedValue([]);
});

describe("authentication", () => {
  it("answers 401 on every route without a session", async () => {
    const res = [
      await listGET(req("GET", "/api/arsip-lama")),
      await createPOST(req("POST", "/api/arsip-lama", validBody)),
      await detailGET(req("GET", "/api/arsip-lama/r1"), ctx()),
      await detailPATCH(req("PATCH", "/api/arsip-lama/r1", {}), ctx()),
      await withdrawPOST(req("POST", "/api/arsip-lama/r1/withdraw", { reason: "alasan cukup panjang" }), ctx()),
    ];
    for (const r of res) {
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "Tidak terautentikasi" });
    }
  });
});

describe("POST /api/arsip-lama", () => {
  it("refuses a unit admin creating for another unit", async () => {
    session.current = unitAdminFeb();
    const res = await createPOST(req("POST", "/api/arsip-lama", { ...validBody, unitId: "fh" }));
    expect(res.status).toBe(403);
    expect(db.legacyDecree.create).not.toHaveBeenCalled();
  });

  it("creates a manual record for the admin's own unit", async () => {
    session.current = unitAdminFeb();
    const res = await createPOST(req("POST", "/api/arsip-lama", validBody));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new1" });
    const data = db.legacyDecree.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      source: "MANUAL",
      isPublic: false,
      isComplete: true,
      unitLabelRaw: "Fakultas Ekonomi dan Bisnis",
      createdById: "au",
      createdByEmail: "au@unigamalang.ac.id",
      tanggalRaw: "Tidak diketahui",
    });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      action: "CREATE",
      targetType: "LegacyDecree",
      targetId: "new1",
      metadata: { event: "create" },
    });
  });

  it("refuses a plain user", async () => {
    session.current = as("USER", "feb");
    const res = await createPOST(req("POST", "/api/arsip-lama", validBody));
    expect(res.status).toBe(403);
    expect(db.legacyDecree.create).not.toHaveBeenCalled();
  });

  it("answers 400 when the letter type does not exist or is soft-deleted", async () => {
    session.current = unitAdminFeb();
    db.letterType.findFirst.mockResolvedValue(null);
    const res = await createPOST(req("POST", "/api/arsip-lama", validBody));
    expect(res.status).toBe(400);
    expect(db.letterType.findFirst.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
    expect(db.legacyDecree.create).not.toHaveBeenCalled();
  });

  it("answers 400 when the unit does not exist or is soft-deleted", async () => {
    session.current = superAdmin();
    db.unit.findFirst.mockResolvedValue(null);
    const res = await createPOST(req("POST", "/api/arsip-lama", validBody));
    expect(res.status).toBe(400);
    expect(db.unit.findFirst.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
  });
});

describe("GET /api/arsip-lama", () => {
  it("returns an empty list for a user without a unit and never queries", async () => {
    session.current = as("USER", null);
    const res = await listGET(req("GET", "/api/arsip-lama"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [], total: 0 });
    expect(db.legacyDecree.findMany).not.toHaveBeenCalled();
  });

  it("scopes a unit user to their unit, non-confidential, not withdrawn", async () => {
    session.current = as("USER", "feb");
    await listGET(req("GET", "/api/arsip-lama?unitId=fh"));
    const where = db.legacyDecree.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ unitId: "feb", confidential: false, withdrawnAt: null });
  });

  it("filters undated letters with year=none", async () => {
    session.current = superAdmin();
    await listGET(req("GET", "/api/arsip-lama?year=none"));
    expect(db.legacyDecree.findMany.mock.calls[0][0].where).toMatchObject({ tanggal: null });
  });

  it("honours the unitId filter for Super Admin and pages with a cap of 100", async () => {
    session.current = superAdmin();
    await listGET(req("GET", "/api/arsip-lama?unitId=fh&pageSize=500&page=2"));
    const args = db.legacyDecree.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ unitId: "fh" });
    expect(args.take).toBe(100);
    expect(args.skip).toBe(100);
  });

  it("shapes rows without any Drive field", async () => {
    session.current = superAdmin();
    db.legacyDecree.findMany.mockResolvedValue([
      {
        id: "r1",
        nomor: "1",
        tanggal: null,
        tanggalRaw: "x",
        perihal: "p",
        direction: "OUTGOING",
        confidential: false,
        isPublic: false,
        source: "MANUAL",
        withdrawnAt: null,
        unit: { code: "FEB", name: "FEB" },
        letterType: { name: "Surat Tugas" },
        files: [{ id: "f1" }],
      },
    ]);
    db.legacyDecree.count.mockResolvedValue(1);
    const body = await (await listGET(req("GET", "/api/arsip-lama"))).json();
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({ unitCode: "FEB", jenis: "Surat Tugas", hasFile: true, withdrawn: false });
  });
});

describe("GET /api/arsip-lama/[id]", () => {
  it("refuses a plain user on a confidential record of their own unit", async () => {
    session.current = as("USER", "feb");
    db.legacyDecree.findUnique.mockResolvedValue(record({ confidential: true }));
    const res = await detailGET(req("GET", "/api/arsip-lama/r1"), ctx());
    expect(res.status).toBe(403);
  });

  it("answers 404 for an unknown record", async () => {
    session.current = superAdmin();
    db.legacyDecree.findUnique.mockResolvedValue(null);
    const res = await detailGET(req("GET", "/api/arsip-lama/zzz"), ctx("zzz"));
    expect(res.status).toBe(404);
  });

  it("never exposes the Drive file id and reads history by LegacyDecree + id", async () => {
    session.current = unitAdminFeb();
    db.legacyDecree.findUnique.mockResolvedValue(
      record({
        files: [
          {
            id: "f1",
            gdriveFileId: "DRIVE-SECRET",
            fileName: "a.pdf",
            mimeType: "application/pdf",
            sizeBytes: 10,
            sha256: "abc",
            uploadedByEmail: "x@y.z",
            uploadedAt: new Date(),
            replacedAt: null,
            replaceReason: null,
            lastCheckedAt: null,
            lastCheckOk: null,
          },
        ],
      })
    );
    const res = await detailGET(req("GET", "/api/arsip-lama/r1"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files[0]).not.toHaveProperty("gdriveFileId");
    expect(body.files[0]).toMatchObject({ id: "f1", fileName: "a.pdf" });
    expect(JSON.stringify(body)).not.toContain("DRIVE-SECRET");
    expect(db.auditLog.findMany.mock.calls[0][0]).toMatchObject({
      where: { targetType: "LegacyDecree", targetId: "r1" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });
});

describe("PATCH /api/arsip-lama/[id]", () => {
  beforeEach(() => {
    db.legacyDecree.findUnique.mockResolvedValue(record());
  });

  it("stamps editedAt and audits before/after for a data change", async () => {
    session.current = unitAdminFeb();
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { nomor: "002/ST/FEB/I/1998" }), ctx());
    expect(res.status).toBe(200);
    const data = db.legacyDecree.update.mock.calls[0][0].data;
    expect(data.editedAt).toBeInstanceOf(Date);
    expect(data.nomor).toBe("002/ST/FEB/I/1998");
    const call = auditMock.mock.calls[0][0];
    expect(call).toMatchObject({ action: "UPDATE", targetType: "LegacyDecree", targetId: "r1" });
    expect((call.metadata as { event: string }).event).toBe("edit");
    expect((call.metadata as { changes: Record<string, unknown> }).changes.nomor).toEqual({
      before: "001/ST/FEB/I/1998",
      after: "002/ST/FEB/I/1998",
    });
  });

  it("does nothing when the values equal the stored ones", async () => {
    session.current = unitAdminFeb();
    const res = await detailPATCH(
      req("PATCH", "/api/arsip-lama/r1", {
        nomor: " 001/ST/FEB/I/1998 ",
        perihal: "Perihal lama",
        tanggal: "1998-03-14",
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses a unit admin changing isPublic", async () => {
    session.current = unitAdminFeb();
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { isPublic: true }), ctx());
    expect(res.status).toBe(403);
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
  });

  it("refuses a unit admin moving the record to another unit", async () => {
    session.current = unitAdminFeb();
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { unitId: "fh" }), ctx());
    expect(res.status).toBe(403);
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
  });

  it("rewrites unitLabelRaw when Super Admin moves the record", async () => {
    session.current = superAdmin();
    db.unit.findFirst.mockResolvedValue({ id: "fh", name: "Fakultas Hukum" });
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { unitId: "fh" }), ctx());
    expect(res.status).toBe(200);
    expect(db.legacyDecree.update.mock.calls[0][0].data).toMatchObject({
      unitId: "fh",
      unitLabelRaw: "Fakultas Hukum",
    });
  });

  it("refuses to publish a letter type other than SK or SE", async () => {
    session.current = superAdmin();
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { isPublic: true }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Hanya SK dan Surat Edaran yang tidak rahasia yang bisa ditampilkan ke publik"
    );
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
  });

  it("refuses to publish a confidential SK", async () => {
    session.current = superAdmin();
    db.legacyDecree.findUnique.mockResolvedValue(
      record({ letterType: { code: "SK", name: "Keputusan" }, confidential: true })
    );
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { isPublic: true }), ctx());
    expect(res.status).toBe(400);
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
  });

  it("lets Super Admin publish a non-confidential SK without touching editedAt", async () => {
    session.current = superAdmin();
    db.legacyDecree.findUnique.mockResolvedValue(record({ letterType: { code: "SK", name: "Keputusan" } }));
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { isPublic: true }), ctx());
    expect(res.status).toBe(200);
    const data = db.legacyDecree.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ isPublic: true });
    expect(data).not.toHaveProperty("editedAt");
  });

  it("forces isPublic off when a record is made confidential, without editedAt", async () => {
    session.current = unitAdminFeb();
    db.legacyDecree.findUnique.mockResolvedValue(
      record({ letterType: { code: "SK", name: "Keputusan" }, isPublic: true })
    );
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { confidential: true }), ctx());
    expect(res.status).toBe(200);
    const data = db.legacyDecree.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ confidential: true, isPublic: false });
    expect(data).not.toHaveProperty("editedAt");
  });

  it("refuses to edit a withdrawn record, even for Super Admin", async () => {
    session.current = superAdmin();
    db.legacyDecree.findUnique.mockResolvedValue(record({ withdrawnAt: new Date() }));
    const res = await detailPATCH(req("PATCH", "/api/arsip-lama/r1", { nomor: "x" }), ctx());
    expect(res.status).toBe(403);
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/arsip-lama/[id]/withdraw", () => {
  const withdraw = (reason: string) =>
    withdrawPOST(req("POST", "/api/arsip-lama/r1/withdraw", { reason }), ctx());

  it("refuses a unit admin", async () => {
    session.current = unitAdminFeb();
    const res = await withdraw("alasan yang cukup panjang");
    expect(res.status).toBe(403);
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
  });

  it("rejects a reason shorter than 10 characters", async () => {
    session.current = superAdmin();
    db.legacyDecree.findUnique.mockResolvedValue(record());
    const res = await withdraw("salah");
    expect(res.status).toBe(400);
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
  });

  it("withdraws the record, takes it off public and audits it", async () => {
    session.current = superAdmin();
    db.legacyDecree.findUnique.mockResolvedValue(record({ isPublic: true }));
    const res = await withdraw("  salah unggah dokumen  ");
    expect(res.status).toBe(200);
    const data = db.legacyDecree.update.mock.calls[0][0].data;
    expect(data.withdrawnAt).toBeInstanceOf(Date);
    expect(data).toMatchObject({
      withdrawnReason: "salah unggah dokumen",
      withdrawnById: "sa",
      withdrawnByEmail: "sa@unigamalang.ac.id",
      isPublic: false,
    });
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      action: "UPDATE",
      targetType: "LegacyDecree",
      targetId: "r1",
      metadata: { event: "withdraw", reason: "salah unggah dokumen" },
    });
  });

  it("answers 409 for an already withdrawn record", async () => {
    session.current = superAdmin();
    db.legacyDecree.findUnique.mockResolvedValue(record({ withdrawnAt: new Date() }));
    const res = await withdraw("alasan yang cukup panjang");
    expect(res.status).toBe(409);
    expect(db.legacyDecree.update).not.toHaveBeenCalled();
  });
});
