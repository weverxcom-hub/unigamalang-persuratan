import { describe, expect, it } from "vitest";
import {
  canCreateOldArchiveFor, canEditOldArchive, canModerateOldArchive, canViewOldArchive,
  oldArchiveListWhere, publicLegacyWhere,
} from "@/lib/arsip-lama/access";

const s = (role: "SUPER_ADMIN" | "ADMIN_UNIT" | "USER", unitId: string | null) =>
  ({ userId: "u", email: "a@unigamalang.ac.id", name: "A", role, unitId, sessionVersion: 1 });
const row = (o: Partial<{ unitId: string | null; confidential: boolean; withdrawnAt: Date | null }> = {}) =>
  ({ unitId: "feb", confidential: false, withdrawnAt: null, ...o });

describe("canViewOldArchive", () => {
  it("lets the owning unit read ordinary records", () => {
    expect(canViewOldArchive(s("USER", "feb"), row())).toBe(true);
    expect(canViewOldArchive(s("ADMIN_UNIT", "feb"), row())).toBe(true);
  });
  it("hides confidential records from USER but not from the unit's admin", () => {
    expect(canViewOldArchive(s("USER", "feb"), row({ confidential: true }))).toBe(false);
    expect(canViewOldArchive(s("ADMIN_UNIT", "feb"), row({ confidential: true }))).toBe(true);
  });
  it("refuses other units and accounts without a unit", () => {
    expect(canViewOldArchive(s("ADMIN_UNIT", "fh"), row())).toBe(false);
    expect(canViewOldArchive(s("USER", null), row())).toBe(false);
  });
  it("shows unit-less and withdrawn records to SUPER_ADMIN only", () => {
    expect(canViewOldArchive(s("ADMIN_UNIT", "feb"), row({ unitId: null }))).toBe(false);
    expect(canViewOldArchive(s("ADMIN_UNIT", "feb"), row({ withdrawnAt: new Date() }))).toBe(false);
    expect(canViewOldArchive(s("SUPER_ADMIN", null), row({ unitId: null, withdrawnAt: new Date() }))).toBe(true);
  });
});

describe("edit / create / moderate", () => {
  it("ADMIN_UNIT edits and creates only for its own unit; USER never", () => {
    expect(canEditOldArchive(s("ADMIN_UNIT", "feb"), row())).toBe(true);
    expect(canEditOldArchive(s("ADMIN_UNIT", "fh"), row())).toBe(false);
    expect(canEditOldArchive(s("USER", "feb"), row())).toBe(false);
    expect(canCreateOldArchiveFor(s("ADMIN_UNIT", "feb"), "feb")).toBe(true);
    expect(canCreateOldArchiveFor(s("ADMIN_UNIT", "feb"), "fh")).toBe(false);
    expect(canCreateOldArchiveFor(s("SUPER_ADMIN", null), "fh")).toBe(true);
  });
  it("freezes withdrawn records for everyone", () => {
    expect(canEditOldArchive(s("SUPER_ADMIN", null), row({ withdrawnAt: new Date() }))).toBe(false);
  });
  it("only SUPER_ADMIN moderates", () => {
    expect(canModerateOldArchive(s("SUPER_ADMIN", null))).toBe(true);
    expect(canModerateOldArchive(s("ADMIN_UNIT", "feb"))).toBe(false);
  });
});

describe("oldArchiveListWhere", () => {
  it("scopes by role", () => {
    expect(oldArchiveListWhere(s("SUPER_ADMIN", null), false)).toEqual({ withdrawnAt: null });
    expect(oldArchiveListWhere(s("SUPER_ADMIN", null), true)).toEqual({});
    expect(oldArchiveListWhere(s("ADMIN_UNIT", "feb"), true)).toEqual({ unitId: "feb", withdrawnAt: null });
    expect(oldArchiveListWhere(s("USER", "feb"), false)).toEqual({ unitId: "feb", withdrawnAt: null, confidential: false });
    expect(oldArchiveListWhere(s("USER", null), false)).toBeNull();
  });
});

describe("publicLegacyWhere", () => {
  it("admits only public, non-confidential, non-withdrawn SK/SE", () => {
    expect(publicLegacyWhere(["sk", "se"])).toEqual({
      isPublic: true, confidential: false, withdrawnAt: null, letterTypeId: { in: ["sk", "se"] },
    });
  });
});
