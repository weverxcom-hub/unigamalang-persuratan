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
  mimeType: string
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
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
      },
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
 *   2. grants read access to anyone with the link, so the app and user can
 *      preview/download without further auth;
 *   3. returns the canonical webViewLink to be stored on the Archive.
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

  // Anyone-with-the-link reader. Idempotent if it already exists; Drive
  // will throw a 'permissionAlreadyExists'-style error which we treat as OK.
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
      supportsAllDrives: true,
    });
  } catch (err) {
    const code = (err as { code?: number; errors?: { reason?: string }[] }).code;
    const reason = (err as { errors?: { reason?: string }[] }).errors?.[0]?.reason;
    if (code !== 409 && reason !== "duplicate") throw err;
  }

  // Re-fetch so webViewLink is populated (it may be null until shared).
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
