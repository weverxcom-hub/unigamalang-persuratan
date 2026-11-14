import { google } from "googleapis";

/**
 * Google Drive integration for storing letter attachments / proof files.
 *
 * Why "resumable upload" instead of streaming through the serverless function?
 *  - Vercel Serverless Functions cap the request body at 4.5 MB. PDFs and
 *    Word docs from accreditation routinely exceed that.
 *  - Drive's resumable upload session URI supports CORS, so the browser can
 *    PUT bytes directly to it after the server creates the session. Bytes
 *    never traverse our serverless function.
 *
 * Both env vars are required for GDrive to be active:
 *   GOOGLE_SERVICE_ACCOUNT_JSON     — full JSON of the service account key.
 *   GOOGLE_DRIVE_PARENT_FOLDER_ID   — Drive folder ID, must be shared to the
 *                                     service account email with Editor.
 *
 * If either is missing, `gdriveAvailable()` returns false and callers should
 * fall back to Vercel Blob (legacy behavior).
 */

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function loadCreds(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    // Vercel UI sometimes escapes newlines in the private key; normalise.
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return null;
  }
}

export function gdriveAvailable(): boolean {
  return Boolean(loadCreds()) && Boolean(process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID);
}

function buildAuth() {
  const creds = loadCreds();
  if (!creds) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON tidak terkonfigurasi");
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
  });
}

function getDrive() {
  return google.drive({ version: "v3", auth: buildAuth() });
}

async function getAccessToken(): Promise<string> {
  const auth = buildAuth();
  const tok = await auth.authorize();
  if (!tok.access_token) throw new Error("Gagal memperoleh access token Google");
  return tok.access_token;
}

export interface ResumableSession {
  uploadUrl: string;
  filename: string;
  mimeType: string;
}

/**
 * Create a resumable upload session in the configured parent folder. The
 * caller (browser) must then PUT the file bytes to `uploadUrl` to complete
 * the upload; Drive responds with the file metadata (id, name, etc.).
 */
export async function createResumableSession(
  filename: string,
  mimeType: string,
  origin?: string | null
): Promise<ResumableSession> {
  if (!gdriveAvailable()) {
    throw new Error("Google Drive tidak terkonfigurasi");
  }
  const folderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID!;
  const token = await getAccessToken();
  const metadata = {
    name: filename,
    parents: [folderId],
    mimeType,
  };
  // Drive only attaches CORS metadata to a resumable session URL when the
  // request that created it includes an `Origin` header. Without this, the
  // browser PUT to `uploadUrl` fails preflight with "Failed to fetch".
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": mimeType,
  };
  if (origin) headers["Origin"] = origin;
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers,
      body: JSON.stringify(metadata),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Gagal membuat sesi upload Drive (HTTP ${res.status}): ${body.slice(0, 200)}`
    );
  }
  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) {
    throw new Error("Drive tidak mengembalikan Location URL untuk sesi upload");
  }
  return { uploadUrl, filename, mimeType };
}

export interface FinalisedFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  webContentLink: string | null;
}

/**
 * After the browser has finished PUT-ing bytes to a resumable session, this
 * server-side step:
 *   1. verifies the file exists and lives in our configured parent folder
 *      (defense against a malicious client passing a stranger's fileId);
 *   2. returns the file metadata to be stored on the Archive. The file is
 *      NOT shared publicly; see openFileStream() for how it is served.
 */
export async function finaliseUpload(fileId: string): Promise<FinalisedFile> {
  if (!gdriveAvailable()) {
    throw new Error("Google Drive tidak terkonfigurasi");
  }
  const folderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID!;
  const drive = getDrive();

  const meta = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,parents,webViewLink,webContentLink",
    supportsAllDrives: true,
  });
  const parents = meta.data.parents ?? [];
  if (!parents.includes(folderId)) {
    throw new Error("File bukan milik folder Drive yang dikonfigurasi");
  }

  // The file stays PRIVATE (only the service account can read it). Viewing
  // goes through GET /api/archives/[id]/proof/file, which checks the app's
  // own access rules first and then streams the bytes from Drive.
  const refreshed = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,webViewLink,webContentLink",
    supportsAllDrives: true,
  });
  const data = refreshed.data;
  if (!data.id || !data.name || !data.webViewLink) {
    throw new Error("Drive tidak mengembalikan metadata file yang lengkap");
  }
  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType ?? "application/octet-stream",
    webViewLink: data.webViewLink,
    webContentLink: data.webContentLink ?? null,
  };
}

/**
 * Remove every "anyone with the link" permission from a file that was made
 * public by the old finaliseUpload(). Returns how many permissions were
 * removed. Used by prisma/revoke-gdrive-public.ts for existing files.
 */
export async function revokePublicAccess(fileId: string): Promise<number> {
  const drive = getDrive();
  const { data } = await drive.permissions.list({
    fileId,
    fields: "permissions(id,type,role)",
    supportsAllDrives: true,
  });
  const publicPerms = (data.permissions ?? []).filter((p) => p.type === "anyone" && p.id);
  for (const p of publicPerms) {
    await drive.permissions.delete({
      fileId,
      permissionId: p.id!,
      supportsAllDrives: true,
    });
  }
  return publicPerms.length;
}

/**
 * Only these types may be rendered inline on our own origin. Anything else
 * (HTML, SVG, unknown) must be sent as a download, otherwise an uploaded file
 * could run script in a logged-in user's session.
 */
const INLINE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function safeInlineMime(mime: string | null | undefined): string | null {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return INLINE_MIME.has(m) ? m : null;
}

export interface DriveFileStream {
  stream: NodeJS.ReadableStream;
  name: string;
  mimeType: string;
  size: number | null;
}

/**
 * Open a read stream for a private Drive file using the service account.
 * Re-checks that the file lives in the configured parent folder, so a
 * tampered gdriveFileId can never expose a file from elsewhere.
 */
export async function openFileStream(fileId: string): Promise<DriveFileStream> {
  if (!gdriveAvailable()) {
    throw new Error("Google Drive tidak terkonfigurasi");
  }
  const folderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID!;
  const drive = getDrive();

  const meta = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size,parents",
    supportsAllDrives: true,
  });
  if (!(meta.data.parents ?? []).includes(folderId)) {
    throw new Error("File bukan milik folder Drive yang dikonfigurasi");
  }

  const media = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
  return {
    stream: media.data as unknown as NodeJS.ReadableStream,
    name: meta.data.name ?? "file",
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    size: meta.data.size ? Number(meta.data.size) : null,
  };
}

/**
 * Best-effort rename of a Drive file. Used after Archive creation so files
 * land in Drive with a human-readable name like
 * `001_UNIGA_SK_IV_2026_Penetapan_Dosen.pdf` instead of the upload-time
 * placeholder. Returns true on success, false on any error (caller keeps
 * going — the file still exists, it just has the original name).
 */
export async function renameFile(
  fileId: string,
  newName: string
): Promise<boolean> {
  if (!gdriveAvailable()) return false;
  try {
    const drive = getDrive();
    await drive.files.update({
      fileId,
      requestBody: { name: newName },
      supportsAllDrives: true,
      fields: "id,name",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort delete (used when an Archive's proof is replaced or when the
 * archive itself is hard-deleted). Returns true on success, false on any
 * error so callers can keep going.
 */
export async function deleteFile(fileId: string): Promise<boolean> {
  if (!gdriveAvailable()) return false;
  try {
    const drive = getDrive();
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return true;
  } catch {
    return false;
  }
}

/** True if `url` looks like a Drive viewer / open URL we issued. */
export function isGdriveUrl(url: string): boolean {
  return /^https:\/\/(drive|docs)\.google\.com\//i.test(url);
}
