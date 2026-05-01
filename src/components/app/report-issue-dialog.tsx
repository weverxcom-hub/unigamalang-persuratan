// TechSpec PR-E (3.4): in-app "Laporkan Masalah" dialog. Mounted from the
// global navbar/topbar so any authenticated user can submit a problem report
// from any page. Auto-fills the current page path as a hint.
"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { CheckCircle2, LifeBuoy, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SessionPayload } from "@/lib/types";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

interface ReportIssueDialogProps {
  session: SessionPayload;
  /** Render variant for the trigger button. */
  variant?: "default" | "outline" | "ghost";
  /** Show only an icon (collapsed sidebar / cramped topbar). */
  iconOnly?: boolean;
  /** Optional className for the trigger. */
  className?: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "screenshot";
}

export function ReportIssueDialog({
  session,
  variant = "outline",
  iconOnly = false,
  className,
}: ReportIssueDialogProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pageHint, setPageHint] = useState(pathname || "");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Non-fatal warning shown alongside the success state when something
  // partial happened (e.g. screenshot upload failed but ticket creation
  // succeeded). Tracked separately from `error` so reset() doesn't wipe it
  // out before the user has a chance to read it.
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-sync the page hint whenever the dialog opens (covers users who navigate
  // between pages and reopen).
  useEffect(() => {
    if (open) {
      setPageHint(pathname || "");
      setSuccess(false);
      setWarning(null);
    }
  }, [open, pathname]);

  function reset() {
    setTitle("");
    setDescription("");
    setScreenshot(null);
    setError(null);
    setSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // NOTE: intentionally do NOT clear `warning` here — it survives so the
    // success view can surface partial-success info (e.g. attachment dropped).
  }

  async function uploadScreenshot(
    file: File
  ): Promise<{ url: string; pathname: string } | null> {
    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
      throw new Error("Format screenshot harus PNG/JPG/WEBP/GIF.");
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      throw new Error(
        `Screenshot melebihi ${Math.floor(MAX_SCREENSHOT_BYTES / 1024 / 1024)}MB.`
      );
    }
    const safe = sanitizeFilename(file.name);
    const path = `persuratan/${session.userId}/tickets/${Date.now()}-${safe}`;
    try {
      const blob = await upload(path, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type || undefined,
      });
      return { url: blob.url, pathname: blob.pathname };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // BLOB_UNAVAILABLE (501) = storage not configured; skip silently and let
      // the report be submitted without an attachment.
      if (/BLOB_UNAVAILABLE|501/.test(message)) return null;
      throw new Error(message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 5) {
      setError("Judul minimal 5 karakter.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Deskripsi minimal 10 karakter.");
      return;
    }
    setSubmitting(true);
    setWarning(null);
    try {
      let screenshotUrl: string | null = null;
      let screenshotPathname: string | null = null;
      let attachmentWarning: string | null = null;
      if (screenshot) {
        try {
          const uploaded = await uploadScreenshot(screenshot);
          if (uploaded) {
            screenshotUrl = uploaded.url;
            screenshotPathname = uploaded.pathname;
          } else {
            // Storage unavailable — ticket still goes through, but the user
            // needs to know their attachment was not stored.
            attachmentWarning =
              "Vercel Blob belum dikonfigurasi — laporan dikirim tanpa lampiran screenshot.";
          }
        } catch (uploadErr) {
          const msg =
            uploadErr instanceof Error ? uploadErr.message : "Gagal mengunggah screenshot.";
          attachmentWarning = `Lampiran gagal: ${msg}. Laporan dikirim tanpa lampiran.`;
        }
      }

      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          pageHint: pageHint.trim() || null,
          screenshotUrl,
          screenshotPathname,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Gagal mengirim laporan.");
        // Surface the attachment warning even on a hard failure so the user
        // understands they'd be re-uploading the screenshot if they retry.
        if (attachmentWarning) setWarning(attachmentWarning);
        return;
      }
      // Success: reset form, show confirmation, refresh route so any badges
      // (e.g. superadmin's pending counter) update on next render. Promote
      // any attachment warning into the success view so it isn't silently lost.
      reset();
      if (attachmentWarning) setWarning(attachmentWarning);
      setSuccess(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button
        type="button"
        variant={variant}
        size={iconOnly ? "icon" : "sm"}
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Laporkan Masalah"
        title="Laporkan masalah ke superadmin"
      >
        <LifeBuoy className="h-4 w-4" />
        {!iconOnly && <span>Laporkan Masalah</span>}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Laporkan Masalah</DialogTitle>
          <DialogDescription>
            Sampaikan kendala atau bug yang Anda temui. Laporan ini akan ditinjau oleh
            superadmin sistem persuratan.
          </DialogDescription>
        </DialogHeader>
        {success ? (
          // Awam-friendly confirmation: jangan auto-close, beri ikon besar dan
          // copy yang eksplisit supaya user awam tidak ragu apakah laporan
          // sudah masuk. Mereka harus klik tombol "Tutup" sendiri untuk
          // menutup dialog (tidak ada timeout).
          <div className="space-y-4 py-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  Laporan berhasil dikirim ke superadmin
                </p>
                <p className="text-sm text-muted-foreground">
                  Tim akan meninjau laporan Anda. Anda dapat memantau status
                  balasan kapan saja di halaman <strong>Laporan Saya</strong>.
                </p>
              </div>
            </div>
            {warning && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                {warning}
              </p>
            )}
            <DialogFooter className="sm:justify-center">
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push("/dashboard/my-tickets");
                }}
              >
                Buka Laporan Saya
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Tutup
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ticket-title">Judul masalah</Label>
              <Input
                id="ticket-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Form Buat Nomor Surat error saat pilih SK"
                maxLength={200}
                required
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-description">Deskripsi masalah</Label>
              <textarea
                id="ticket-description"
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan langkah-langkah yang Anda lakukan, hasil yang muncul, dan apa yang Anda harapkan."
                maxLength={5000}
                required
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-page">Halaman / fitur yang bermasalah</Label>
              <Input
                id="ticket-page"
                value={pageHint}
                onChange={(e) => setPageHint(e.target.value)}
                placeholder="/dashboard/generate atau Form Buat Nomor Surat"
                maxLength={200}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Otomatis terisi dengan halaman saat ini ({pathname || "/"}). Boleh diubah.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-screenshot">Screenshot (opsional, maks 5MB)</Label>
              <Input
                id="ticket-screenshot"
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                disabled={submitting}
              />
              {screenshot && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    {screenshot.name} · {(screenshot.size / 1024).toFixed(0)} KB
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setScreenshot(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    disabled={submitting}
                  >
                    <X className="h-3 w-3" />
                    Hapus
                  </Button>
                </div>
              )}
            </div>
            {warning && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                {warning}
              </p>
            )}
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Kirim Laporan
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
