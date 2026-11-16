import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Google Drive client (see gdrive-private.test.ts): googleapis is the
// only dependency replaced; the rest is real code.
const drive = {
  files: { get: vi.fn(), update: vi.fn(), delete: vi.fn() },
  permissions: { create: vi.fn(), list: vi.fn(), delete: vi.fn() },
};

vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: vi.fn() },
    drive: vi.fn(() => drive),
  },
}));

const FOLDER = "folder-1";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID = FOLDER;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "svc@test.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  });
});

describe("upload stamp", () => {
  it("binds the Drive name to the full user id", async () => {
    const { stampUploadName, uploadedBy, originalName } = await import("@/lib/arsip-lama/upload");
    const name = stampUploadName("cku1abcdefghijklmnop", "SK 1998/01.pdf", 1700000000000);
    expect(name).toBe("1700000000000-cku1abcdefghijklmnop-SK 1998_01.pdf");
    expect(uploadedBy(name, "cku1abcdefghijklmnop")).toBe(true);
    expect(uploadedBy(name, "cku1abcdefghijklmnoX")).toBe(false);
    expect(uploadedBy("1700000000000-cku1abcd-x.pdf", "cku1abcdefghijklmnop")).toBe(false); // old 8-char stamp
    expect(originalName(name, "cku1abcdefghijklmnop")).toBe("SK 1998_01.pdf");
  });
  it("sanitises backslashes in the file name", async () => {
    const { stampUploadName } = await import("@/lib/arsip-lama/upload");
    expect(stampUploadName("u1", "a\\b.pdf", 1)).toBe("1-u1-a_b.pdf");
  });
});

describe("getFileFingerprint", () => {
  it("returns Drive's sha256 and size for a file in our folder", async () => {
    const { getFileFingerprint } = await import("@/lib/gdrive");
    drive.files.get.mockResolvedValue({ data: { id: "f1", name: "n.pdf", mimeType: "application/pdf",
      size: "2048", parents: [FOLDER], sha256Checksum: "ab".repeat(32) } });
    expect(await getFileFingerprint("f1")).toEqual({ id: "f1", name: "n.pdf",
      mimeType: "application/pdf", sizeBytes: 2048, sha256: "ab".repeat(32) });
  });
  it("hashes the bytes itself when Drive gives no checksum", async () => {
    const { getFileFingerprint } = await import("@/lib/gdrive");
    drive.files.get
      .mockResolvedValueOnce({ data: { id: "f1", name: "n.pdf", mimeType: "application/pdf", size: "3", parents: [FOLDER] } })
      .mockResolvedValueOnce({ data: Readable.from([Buffer.from("abc")]) });
    expect((await getFileFingerprint("f1")).sha256)
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("rejects a file outside the folder", async () => {
    const { getFileFingerprint } = await import("@/lib/gdrive");
    drive.files.get.mockResolvedValue({ data: { id: "f1", name: "n.pdf", size: "1", parents: ["other"] } });
    await expect(getFileFingerprint("f1")).rejects.toThrow(/bukan milik folder/i);
  });
  it("reports an unfinished upload", async () => {
    const { getFileFingerprint } = await import("@/lib/gdrive");
    drive.files.get.mockResolvedValue({ data: { id: "f1", name: "n.pdf", size: "0", parents: [FOLDER] } });
    await expect(getFileFingerprint("f1")).rejects.toThrow(/belum selesai diunggah/i);
  });
  it("reports a missing or trashed file as DriveFileMissingError", async () => {
    const { getFileFingerprint, DriveFileMissingError } = await import("@/lib/gdrive");
    drive.files.get.mockRejectedValueOnce(Object.assign(new Error("nf"), { code: 404 }));
    await expect(getFileFingerprint("gone")).rejects.toBeInstanceOf(DriveFileMissingError);
    drive.files.get.mockResolvedValueOnce({ data: { id: "f1", name: "n.pdf", size: "1", parents: [FOLDER], trashed: true } });
    await expect(getFileFingerprint("f1")).rejects.toBeInstanceOf(DriveFileMissingError);
  });
});
