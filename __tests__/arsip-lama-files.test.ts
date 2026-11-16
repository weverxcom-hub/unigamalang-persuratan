import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Session, database, Drive and audit log are replaced; the routes' own rules
// and the real access/upload helpers run for real. The prisma mock has no
// delete/deleteMany anywhere, so any attempt to delete throws.
const { session, db, order, txCalls, drive } = vi.hoisted(() => {
  class DriveFileMissingError extends Error {}
  const order: string[] = [];
  const txCalls = {
    decreeUpdate: vi.fn(),
    fileUpdateMany: vi.fn(),
    fileCreate: vi.fn(),
    fileUpdate: vi.fn(),
  };
  const tx = {
    legacyDecree: {
      update: async (a: unknown) => {
        order.push("decree.update");
        return txCalls.decreeUpdate(a);
      },
    },
    legacyDecreeFile: {
      updateMany: async (a: unknown) => {
        order.push("file.updateMany");
        return txCalls.fileUpdateMany(a);
      },
      create: async (a: unknown) => {
        order.push("file.create");
        return txCalls.fileCreate(a);
      },
      update: async (a: unknown) => {
        order.push("file.update");
        return txCalls.fileUpdate(a);
      },
    },
  };
  return {
    session: { current: null as null | Record<string, unknown> },
    order,
    txCalls,
    drive: {
      DriveFileMissingError,
      getFileFingerprint: vi.fn(),
      openFileStream: vi.fn(),
      tx,
    },
    db: {
      legacyDecree: { findUnique: vi.fn() },
      legacyDecreeFile: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
      archive: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
});
vi.mock("@/lib/auth", () => ({ getSession: async () => session.current }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async (_input: unknown, tx?: unknown) => {
    if (tx) order.push("audit");
  }),
}));
vi.mock("@/lib/gdrive", () => ({
  DriveFileMissingError: drive.DriveFileMissingError,
  getFileFingerprint: drive.getFileFingerprint,
  openFileStream: drive.openFileStream,
  safeInlineMime: (m: string | null | undefined) => (m === "application/pdf" ? m : null),
}));

import { audit } from "@/lib/audit";
import { POST as attachPOST } from "@/app/api/arsip-lama/[id]/files/route";
import { GET as openGET } from "@/app/api/arsip-lama/[id]/files/[fileId]/route";
import { POST as checkPOST } from "@/app/api/arsip-lama/[id]/files/[fileId]/check/route";

const auditMock = vi.mocked(audit);
const { DriveFileMissingError } = drive;

function as(role: string, unitId: string | null, userId = "u1") {
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
const fctx = (id = "r1", fileId = "f1") => ({ params: Promise.resolve({ id, fileId }) });

const decree = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  unitId: "feb",
  confidential: false,
  withdrawnAt: null,
  ...over,
});
const fingerprint = (over: Record<string, unknown> = {}) => ({
  id: "drv1",
  name: "1700000000000-au-scan.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  sha256: "a".repeat(64),
  ...over,
});
const attach = (body: unknown = { fileId: "drv1" }) =>
  attachPOST(req("POST", "/api/arsip-lama/r1/files", body), ctx());

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  session.current = null;
  db.legacyDecree.findUnique.mockResolvedValue(decree());
  db.legacyDecreeFile.findFirst.mockResolvedValue(null);
  db.legacyDecreeFile.findUnique.mockResolvedValue(null);
  db.legacyDecreeFile.findMany.mockResolvedValue([]);
  db.archive.findFirst.mockResolvedValue(null);
  drive.getFileFingerprint.mockResolvedValue(fingerprint());
  txCalls.fileCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "newfile",
    ...data,
  }));
});

describe("authentication", () => {
  it("answers 401 on every route without a session", async () => {
    const res = [
      await attach(),
      await openGET(req("GET", "/x"), fctx()),
      await checkPOST(req("POST", "/x"), fctx()),
    ];
    for (const r of res) {
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "Tidak terautentikasi" });
    }
  });
});

describe("attach (POST /files)", () => {
  it("refuses a plain USER with 403", async () => {
    session.current = as("USER", "feb");
    const res = await attach();
    expect(res.status).toBe(403);
    expect(drive.getFileFingerprint).not.toHaveBeenCalled();
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("refuses a withdrawn record even for SUPER_ADMIN with 403", async () => {
    session.current = superAdmin();
    db.legacyDecree.findUnique.mockResolvedValue(decree({ withdrawnAt: new Date() }));
    const res = await attach();
    expect(res.status).toBe(403);
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown record", async () => {
    session.current = unitAdminFeb();
    db.legacyDecree.findUnique.mockResolvedValue(null);
    expect((await attach()).status).toBe(404);
  });

  it("answers 400 when Drive no longer has the file, and creates nothing", async () => {
    session.current = unitAdminFeb();
    drive.getFileFingerprint.mockRejectedValue(new DriveFileMissingError("hilang"));
    const res = await attach();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Berkas tidak ditemukan di Google Drive. Unggah ulang.",
    });
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("answers 400 with the message when the upload is not finished, and creates nothing", async () => {
    session.current = unitAdminFeb();
    drive.getFileFingerprint.mockRejectedValue(new Error("Berkas belum selesai diunggah"));
    const res = await attach();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Berkas belum selesai diunggah" });
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("refuses a file stamped with another user's id with 403", async () => {
    session.current = unitAdminFeb();
    drive.getFileFingerprint.mockResolvedValue(
      fingerprint({ name: "1700000000000-someoneelse-scan.pdf" })
    );
    const res = await attach();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Berkas ini bukan unggahan Anda" });
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("refuses application/msword with 400", async () => {
    session.current = unitAdminFeb();
    drive.getFileFingerprint.mockResolvedValue(fingerprint({ mimeType: "application/msword" }));
    const res = await attach();
    expect(res.status).toBe(400);
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("refuses a file over 25 MB as reported by Drive with 400", async () => {
    session.current = unitAdminFeb();
    drive.getFileFingerprint.mockResolvedValue(fingerprint({ sizeBytes: 25 * 1024 * 1024 + 1 }));
    const res = await attach({ fileId: "drv1", sizeBytes: 1 });
    expect(res.status).toBe(400);
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("answers 409 for a Drive id already used by an Archive", async () => {
    session.current = unitAdminFeb();
    db.archive.findFirst.mockResolvedValue({ id: "arc1" });
    const res = await attach();
    expect(res.status).toBe(409);
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("answers 409 for a Drive id already used by a LegacyDecreeFile", async () => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findUnique.mockResolvedValue({ id: "other" });
    expect((await attach()).status).toBe(409);
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("first attach answers 201 using Drive's sha256 and size, not the request's", async () => {
    session.current = unitAdminFeb();
    const res = await attach({ fileId: "drv1", sha256: "f".repeat(64), sizeBytes: 1 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.file).toEqual({
      id: "newfile",
      fileName: "scan.pdf",
      sha256: "a".repeat(64),
      sizeBytes: 2048,
    });
    expect(body.duplicates).toEqual({ viewable: [], hiddenCount: 0 });
    expect(JSON.stringify(body)).not.toContain("drv1");

    const data = txCalls.fileCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      decreeId: "r1",
      gdriveFileId: "drv1",
      sha256: "a".repeat(64),
      sizeBytes: 2048,
      mimeType: "application/pdf",
      uploadedById: "au",
      uploadedByEmail: "au@unigamalang.ac.id",
    });

    const [input, txArg] = auditMock.mock.calls[0];
    expect(input).toMatchObject({
      action: "UPLOAD",
      targetType: "LegacyDecree",
      targetId: "r1",
      metadata: { event: "file_add", sha256: "a".repeat(64), fileName: "scan.pdf" },
    });
    expect(txArg).toBeDefined();
  });

  it("replace without replaceReason answers 400 and writes nothing", async () => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findFirst.mockResolvedValue({ id: "old" });
    const res = await attach({ fileId: "drv1" });
    expect(res.status).toBe(400);
    const short = await attach({ fileId: "drv1", replaceReason: "  pendek " });
    expect(short.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(txCalls.fileCreate).not.toHaveBeenCalled();
  });

  it("replace with a reason writes in order, retires the old version and never deletes", async () => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findFirst.mockResolvedValue({ id: "old" });
    const res = await attach({ fileId: "drv1", replaceReason: "  Scan lebih jelas dari aslinya  " });
    expect(res.status).toBe(201);

    expect(order).toEqual(["decree.update", "file.updateMany", "file.create", "audit"]);
    const um = txCalls.fileUpdateMany.mock.calls[0][0];
    expect(um.where).toEqual({ decreeId: "r1", replacedAt: null });
    expect(um.data.replaceReason).toBe("Scan lebih jelas dari aslinya");
    expect(um.data.replacedAt).toBeInstanceOf(Date);
    expect(txCalls.decreeUpdate.mock.calls[0][0].where).toEqual({ id: "r1" });

    expect(auditMock.mock.calls[0][0]).toMatchObject({
      metadata: { event: "file_replace", replaceReason: "Scan lebih jelas dari aslinya" },
    });
    // The fakes expose no delete/deleteMany at all.
    for (const model of [drive.tx.legacyDecree, drive.tx.legacyDecreeFile, db.legacyDecreeFile]) {
      expect(Object.keys(model)).not.toContain("delete");
      expect(Object.keys(model)).not.toContain("deleteMany");
    }
  });

  it("lists duplicates the caller may see and only counts the rest", async () => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findMany.mockResolvedValue([
      { decree: { id: "A", nomor: "001/A", perihal: "Perihal A", unitId: "feb", confidential: false, withdrawnAt: null } },
      { decree: { id: "A", nomor: "001/A", perihal: "Perihal A", unitId: "feb", confidential: false, withdrawnAt: null } },
      { decree: { id: "B", nomor: "002/B", perihal: "RAHASIA-B", unitId: "feh", confidential: false, withdrawnAt: null } },
    ]);
    const res = await attach();
    expect(res.status).toBe(201);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.duplicates.viewable).toEqual([{ id: "A", nomor: "001/A", perihal: "Perihal A" }]);
    expect(body.duplicates.hiddenCount).toBe(1);
    expect(text).not.toContain("RAHASIA-B");
    expect(db.legacyDecreeFile.findMany.mock.calls[0][0].where).toEqual({
      sha256: "a".repeat(64),
      decreeId: { not: "r1" },
    });
  });
});

describe("open (GET /files/[fileId])", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "f1",
    decreeId: "r1",
    gdriveFileId: "drv1",
    fileName: "scan.pdf",
    ...over,
  });
  const open = (c = fctx()) => openGET(req("GET", "/api/arsip-lama/r1/files/f1"), c);

  it("answers 404 when the file row belongs to a different record", async () => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findUnique.mockResolvedValue(row({ decreeId: "other" }));
    const res = await open();
    expect(res.status).toBe(404);
    expect(drive.openFileStream).not.toHaveBeenCalled();
  });

  it("answers 403 for another unit and never opens Drive", async () => {
    session.current = as("ADMIN_UNIT", "feh", "x");
    db.legacyDecreeFile.findUnique.mockResolvedValue(row());
    const res = await open();
    expect(res.status).toBe(403);
    expect(drive.openFileStream).not.toHaveBeenCalled();
  });

  it("answers 404 when Drive no longer has the file", async () => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findUnique.mockResolvedValue(row());
    drive.openFileStream.mockRejectedValue(new DriveFileMissingError("hilang"));
    const res = await open();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Berkas tidak ditemukan di Google Drive" });
  });

  it("treats a Drive error with code 404 as missing, other errors as 502", async () => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findUnique.mockResolvedValue(row());
    drive.openFileStream.mockRejectedValueOnce(Object.assign(new Error("nf"), { code: 404 }));
    expect((await open()).status).toBe(404);
    drive.openFileStream.mockRejectedValueOnce(new Error("boom"));
    const res = await open();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("drv1");
  });

  it("streams the bytes with the private headers", async () => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findUnique.mockResolvedValue(row());
    drive.openFileStream.mockResolvedValue({
      stream: Readable.from([Buffer.from("PDFDATA")]),
      name: "1700000000000-au-scan.pdf",
      mimeType: "application/pdf",
      size: 7,
    });
    const res = await open();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe("inline; filename*=UTF-8''scan.pdf");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.text()).toBe("PDFDATA");
    expect(drive.openFileStream).toHaveBeenCalledWith("drv1");
  });
});

describe("integrity check (POST /files/[fileId]/check)", () => {
  const row = { id: "f1", decreeId: "r1", gdriveFileId: "drv1", sha256: "a".repeat(64) };
  const check = () => checkPOST(req("POST", "/api/arsip-lama/r1/files/f1/check"), fctx());
  beforeEach(() => {
    session.current = unitAdminFeb();
    db.legacyDecreeFile.findUnique.mockResolvedValue(row);
  });

  it("answers 403 for a caller who may not view the record", async () => {
    session.current = as("ADMIN_UNIT", "feh", "x");
    expect((await check()).status).toBe(403);
    expect(drive.getFileFingerprint).not.toHaveBeenCalled();
  });

  it("answers OK when the hash matches", async () => {
    const res = await check();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe("OK");
    expect(typeof body.checkedAt).toBe("string");
    const arg = txCalls.fileUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "f1" });
    expect(arg.data.lastCheckOk).toBe(true);
    expect(arg.data.lastCheckedAt).toBeInstanceOf(Date);
    expect(order).toEqual(["file.update", "audit"]);
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      action: "UPDATE",
      targetType: "LegacyDecree",
      targetId: "r1",
      metadata: { event: "integrity_check", result: "OK", fileId: "f1" },
    });
  });

  it("answers MISMATCH when the hash differs", async () => {
    drive.getFileFingerprint.mockResolvedValue(fingerprint({ sha256: "b".repeat(64) }));
    const res = await check();
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe("MISMATCH");
    expect(txCalls.fileUpdate.mock.calls[0][0].data.lastCheckOk).toBe(false);
  });

  it("answers 200 MISSING when Drive no longer has the file", async () => {
    drive.getFileFingerprint.mockRejectedValue(new DriveFileMissingError("hilang"));
    const res = await check();
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe("MISSING");
    expect(txCalls.fileUpdate.mock.calls[0][0].data.lastCheckOk).toBe(false);
  });

  it("answers 502 on another Drive error and records nothing", async () => {
    drive.getFileFingerprint.mockRejectedValue(new Error("Drive down"));
    const res = await check();
    expect(res.status).toBe(502);
    expect(txCalls.fileUpdate).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});
