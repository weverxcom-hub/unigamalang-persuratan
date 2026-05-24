# File Upload Security

## Current State

File uploads are validated by:
- **MIME type allowlist**: Only `image/*`, `application/pdf`, `application/msword`, and OpenXML formats
- **File size limits**: 2MB inline, 5MB Blob, 25MB Google Drive
- **Extension check**: Client-side + server-side validation

## Recommended: ClamAV Integration

For production environments handling sensitive university documents, integrate ClamAV:

### Option A: Self-hosted ClamAV (Docker)

```yaml
# docker-compose.yml (add to existing stack)
clamav:
  image: clamav/clamav:stable
  ports:
    - "3310:3310"
  volumes:
    - clamav-data:/var/lib/clamav
```

```typescript
// src/lib/scan-file.ts
import net from "node:net";

export async function scanBuffer(buffer: Buffer): Promise<{ clean: boolean; virus?: string }> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(
      { host: process.env.CLAMAV_HOST || "localhost", port: 3310 },
      () => {
        client.write("zINSTREAM\0");
        const size = Buffer.alloc(4);
        size.writeUInt32BE(buffer.length);
        client.write(size);
        client.write(buffer);
        client.write(Buffer.alloc(4)); // zero-length chunk = end
      }
    );
    let response = "";
    client.on("data", (data) => (response += data.toString()));
    client.on("end", () => {
      if (response.includes("OK")) resolve({ clean: true });
      else resolve({ clean: false, virus: response.trim() });
    });
    client.on("error", reject);
  });
}
```

### Option B: Cloud Scanning (VirusTotal API)

```typescript
// Scan via VirusTotal (free tier: 4 req/min)
const VT_API_KEY = process.env.VIRUSTOTAL_API_KEY;

export async function scanWithVirusTotal(buffer: Buffer, filename: string) {
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  const res = await fetch("https://www.virustotal.com/api/v3/files", {
    method: "POST",
    headers: { "x-apikey": VT_API_KEY! },
    body: form,
  });
  return res.json();
}
```

### Integration Point

Add scanning to the archive POST handler (`src/app/api/archives/route.ts`) after file upload but before saving the archive record. If the scan fails or detects a threat, return a 422 response and delete the uploaded file.

## Priority

**Medium** — University documents are generally low-risk (PDFs, scanned letters), but implementing ClamAV adds defense-in-depth against malicious file uploads.
