import crypto from "node:crypto";

/**
 * Placeholder stored in Archive.number while a USER's draft waits for admin
 * approval (status PENDING). The real number is allocated only on approval
 * (PATCH /api/archives/[id]), so a draft — approved or rejected — never
 * consumes a sequence number and never leaves a hole in the book.
 *
 * Archive.number is @unique, so the placeholder has to be unique too:
 * 6 random bytes, never derived from the counter.
 */
const PREFIX = "DRAF-";

export function draftPlaceholderNumber(): string {
  return PREFIX + crypto.randomBytes(6).toString("hex").toUpperCase();
}

export function isDraftPlaceholderNumber(number: string): boolean {
  return /^DRAF-[0-9A-F]{12}$/.test(number);
}
