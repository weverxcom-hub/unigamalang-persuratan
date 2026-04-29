/**
 * Convert one or more image files (JPEG/PNG/WebP) into a single PDF in the
 * browser using jsPDF. Returned as a `File` so it slots straight into the
 * existing upload flow.
 *
 * Why client-side?
 *  - Avoids a second round trip and a server endpoint.
 *  - Keeps the user's photos out of the serverless body cap.
 *  - jsPDF is small (~80 kB gzipped) and tree-shakes well.
 *
 * Each image becomes one A4-portrait page. Image is letterboxed to fit while
 * preserving aspect ratio and adds a small margin so nothing is clipped.
 */
import { jsPDF } from "jspdf";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 8;

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal memuat gambar"));
    };
    img.src = url;
  });
}

interface PreparedImage {
  dataUrl: string;
  format: "JPEG" | "PNG";
}

/**
 * Prepare an image for jsPDF. JPEG and PNG are passed through directly so
 * jsPDF can re-encode them losslessly. Anything else (WebP, AVIF, …) is
 * transcoded to JPEG via canvas and we tag the format accordingly so the
 * `format` argument to `pdf.addImage` matches the actual bytes.
 */
async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.type === "image/jpeg" || file.type === "image/jpg") {
    return { dataUrl: await readAsDataUrl(file), format: "JPEG" };
  }
  if (file.type === "image/png") {
    return { dataUrl: await readAsDataUrl(file), format: "PNG" };
  }
  const img = await readImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung canvas");
  ctx.drawImage(img, 0, 0);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), format: "JPEG" };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca gambar"));
    reader.readAsDataURL(file);
  });
}

export async function imagesToPdf(
  files: File[],
  outputFilename: string
): Promise<File> {
  if (files.length === 0) throw new Error("Tidak ada gambar untuk digabung");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const usableW = A4_WIDTH_MM - MARGIN_MM * 2;
  const usableH = A4_HEIGHT_MM - MARGIN_MM * 2;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const img = await readImage(f);
    const prepared = await prepareImage(f);
    const ratio = img.naturalWidth / img.naturalHeight;
    let drawW = usableW;
    let drawH = usableW / ratio;
    if (drawH > usableH) {
      drawH = usableH;
      drawW = usableH * ratio;
    }
    const offsetX = (A4_WIDTH_MM - drawW) / 2;
    const offsetY = (A4_HEIGHT_MM - drawH) / 2;
    if (i > 0) pdf.addPage();
    pdf.addImage(
      prepared.dataUrl,
      prepared.format,
      offsetX,
      offsetY,
      drawW,
      drawH,
      undefined,
      "FAST"
    );
  }

  const blob = pdf.output("blob");
  return new File([blob], outputFilename, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}
