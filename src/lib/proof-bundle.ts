// `imagesToPdf` pulls in jsPDF (~250KB minified). Loaded lazily so the dashboard
// shell, which always imports `isImageFile`, doesn't pay the bundle cost up
// front.

export interface BundleResult {
  file: File;
  // True when 2+ images were merged into a single PDF on the client.
  merged: boolean;
}

const IMAGE_MIME_RE = /^image\/(jpeg|jpg|png|webp)$/i;

export function isImageFile(f: File): boolean {
  return IMAGE_MIME_RE.test(f.type);
}

/**
 * Normalise an arbitrary list of user-selected files into a single proof file
 * suitable for upload. Rules:
 *
 *   - Empty list                 → throw
 *   - Exactly one file           → returned as-is
 *   - All files are images       → merged into a single PDF (one page per image)
 *   - Mix of images + PDF        → throw, ask user to pick one mode
 *   - 2+ PDFs / 2+ docs          → throw, only image-multi is supported
 */
export async function bundleProofFiles(
  files: File[],
  outputBaseName = "surat"
): Promise<BundleResult> {
  if (files.length === 0) {
    throw new Error("Pilih minimal 1 file bukti.");
  }
  if (files.length === 1) {
    return { file: files[0], merged: false };
  }
  const allImages = files.every(isImageFile);
  if (!allImages) {
    throw new Error(
      "Hanya beberapa foto yang bisa digabung. Untuk PDF / Word, pilih satu file saja."
    );
  }
  const safeBase = outputBaseName.replace(/[^A-Za-z0-9._-]+/g, "_") || "surat";
  const { imagesToPdf } = await import("./images-to-pdf");
  const pdf = await imagesToPdf(files, `${safeBase}.pdf`);
  return { file: pdf, merged: true };
}
