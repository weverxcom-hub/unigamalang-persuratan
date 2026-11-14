import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Google Drive client. googleapis is an external service, so it is the
// one dependency we replace; everything else is the real gdrive.ts code.
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

describe("finaliseUpload", () => {
  it("verifies the folder but never makes the file public", async () => {
    drive.files.get.mockResolvedValue({
      data: {
        id: "f1",
        name: "a.pdf",
        mimeType: "application/pdf",
        parents: [FOLDER],
        webViewLink: "https://drive.google.com/file/d/f1/view",
      },
    });
    const { finaliseUpload } = await import("@/lib/gdrive");

    const file = await finaliseUpload("f1");

    expect(file.id).toBe("f1");
    expect(drive.permissions.create).not.toHaveBeenCalled();
  });

  it("rejects a file outside the configured folder", async () => {
    drive.files.get.mockResolvedValue({
      data: { id: "f2", name: "x.pdf", parents: ["other-folder"] },
    });
    const { finaliseUpload } = await import("@/lib/gdrive");

    await expect(finaliseUpload("f2")).rejects.toThrow(/bukan milik folder/i);
  });
});

describe("revokePublicAccess", () => {
  it("removes only the 'anyone' permission and reports how many", async () => {
    drive.permissions.list.mockResolvedValue({
      data: {
        permissions: [
          { id: "anyoneWithLink", type: "anyone", role: "reader" },
          { id: "owner-1", type: "user", role: "owner" },
        ],
      },
    });
    drive.permissions.delete.mockResolvedValue({});
    const { revokePublicAccess } = await import("@/lib/gdrive");

    const removed = await revokePublicAccess("f1");

    expect(removed).toBe(1);
    expect(drive.permissions.delete).toHaveBeenCalledTimes(1);
    expect(drive.permissions.delete).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1", permissionId: "anyoneWithLink" })
    );
  });

  it("does nothing when the file is already private", async () => {
    drive.permissions.list.mockResolvedValue({
      data: { permissions: [{ id: "owner-1", type: "user", role: "owner" }] },
    });
    const { revokePublicAccess } = await import("@/lib/gdrive");

    expect(await revokePublicAccess("f1")).toBe(0);
    expect(drive.permissions.delete).not.toHaveBeenCalled();
  });
});

describe("openFileStream", () => {
  it("refuses to stream a file that is not in the configured folder", async () => {
    drive.files.get.mockResolvedValue({
      data: { id: "f3", name: "x.pdf", mimeType: "application/pdf", parents: ["other"] },
    });
    const { openFileStream } = await import("@/lib/gdrive");

    await expect(openFileStream("f3")).rejects.toThrow(/bukan milik folder/i);
  });
});

describe("safeInlineMime", () => {
  it("allows PDF and common images to render inline", async () => {
    const { safeInlineMime } = await import("@/lib/gdrive");
    expect(safeInlineMime("application/pdf")).toBe("application/pdf");
    expect(safeInlineMime("image/png")).toBe("image/png");
    expect(safeInlineMime("IMAGE/JPEG")).toBe("image/jpeg");
  });

  it("never lets active content render inline on our origin", async () => {
    const { safeInlineMime } = await import("@/lib/gdrive");
    expect(safeInlineMime("text/html")).toBeNull();
    expect(safeInlineMime("image/svg+xml")).toBeNull();
    expect(safeInlineMime("application/octet-stream")).toBeNull();
    expect(safeInlineMime(undefined)).toBeNull();
  });
});
