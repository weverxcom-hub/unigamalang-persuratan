/** Old-letter scans: PDF and images only, at most 25 MB. */
export const OLD_ARCHIVE_MIME: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

export const OLD_ARCHIVE_MAX_BYTES = 25 * 1024 * 1024;

/** `${now}-${userId}-${safeName}` — full userId, unlike /api/gdrive/init's 8-char prefix. */
export function stampUploadName(userId: string, filename: string, now: number): string {
  const safe = filename.replace(/[\/:*?"<>|]/g, "_").slice(0, 150);
  return `${now}-${userId}-${safe}`;
}

function stampPrefix(driveName: string, userId: string): string | null {
  const m = /^\d+-/.exec(driveName);
  if (!m) return null;
  const prefix = `${m[0]}${userId}-`;
  return driveName.startsWith(prefix) ? prefix : null;
}

export function uploadedBy(driveName: string, userId: string): boolean {
  return stampPrefix(driveName, userId) !== null;
}

/** Drive name with the stamp removed, for display. */
export function originalName(driveName: string, userId: string): string {
  const prefix = stampPrefix(driveName, userId);
  return prefix ? driveName.slice(prefix.length) : driveName;
}
