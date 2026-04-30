// Resend wrapper. Falls back to console.log when RESEND_API_KEY is missing so
// the dev loop never gets blocked on email config.

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress =
  process.env.RESEND_FROM_EMAIL || "Sistem Persuratan <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

export const EMAIL_AVAILABLE = !!apiKey;

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tags?: { name: string; value: string }[];
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string | null; skipped: boolean }> {
  if (!resend) {
    // eslint-disable-next-line no-console
    console.info("[email/resend disabled]", {
      to: input.to,
      subject: input.subject,
    });
    return { id: null, skipped: true };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: input.tags,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[email/resend error]", error);
      return { id: null, skipped: false };
    }
    return { id: data?.id ?? null, skipped: false };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[email/resend threw]", e);
    return { id: null, skipped: false };
  }
}

export function renderIncomingLetterEmail(params: {
  recipientName: string;
  number: string;
  subject: string;
  sender: string;
  date: string;
  appUrl: string;
  archiveId: string;
}): { html: string; text: string } {
  const link = `${params.appUrl}/dashboard/archives?highlight=${encodeURIComponent(params.archiveId)}`;
  const text = `Surat masuk baru telah dicatat di Sistem Persuratan Unigamalang.

Nomor: ${params.number}
Perihal: ${params.subject}
Pengirim: ${params.sender}
Tanggal: ${params.date}

Lihat di: ${link}`;
  const html = `<!doctype html><html><body style="font-family: system-ui, sans-serif; background:#f6f7f9; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; padding:24px; border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 8px; color:#7f1d1d;">Surat Masuk Baru</h2>
    <p style="margin:0 0 16px; color:#374151;">Halo <strong>${escapeHtml(params.recipientName)}</strong>, ada surat masuk yang perlu ditindaklanjuti.</p>
    <table style="width:100%; border-collapse:collapse; color:#111827;">
      <tr><td style="padding:6px 0; color:#6b7280;">Nomor</td><td style="padding:6px 0;"><code>${escapeHtml(params.number)}</code></td></tr>
      <tr><td style="padding:6px 0; color:#6b7280;">Perihal</td><td style="padding:6px 0;">${escapeHtml(params.subject)}</td></tr>
      <tr><td style="padding:6px 0; color:#6b7280;">Pengirim</td><td style="padding:6px 0;">${escapeHtml(params.sender)}</td></tr>
      <tr><td style="padding:6px 0; color:#6b7280;">Tanggal</td><td style="padding:6px 0;">${escapeHtml(params.date)}</td></tr>
    </table>
    <p style="margin:20px 0 0;"><a href="${link}" style="display:inline-block; padding:10px 16px; background:#991b1b; color:#fff; text-decoration:none; border-radius:8px;">Buka Arsip</a></p>
  </div>
  <p style="max-width:560px; margin:12px auto 0; color:#6b7280; font-size:12px;">Universitas Gajayana Malang · Sistem Manajemen Persuratan</p>
</body></html>`;
  return { html, text };
}

export function renderDispositionEmail(params: {
  recipientName: string;
  archiveNumber: string;
  subject: string;
  fromName: string;
  instructions: string;
  dueDate: string | null;
  appUrl: string;
  archiveId: string;
}): { html: string; text: string } {
  const link = `${params.appUrl}/dashboard/archives?highlight=${encodeURIComponent(params.archiveId)}`;
  const text = `Anda menerima disposisi baru dari ${params.fromName}.

Nomor surat: ${params.archiveNumber}
Perihal: ${params.subject}
Instruksi: ${params.instructions}
${params.dueDate ? `Batas waktu: ${params.dueDate}\n` : ""}
Buka: ${link}`;
  const html = `<!doctype html><html><body style="font-family: system-ui, sans-serif; background:#f6f7f9; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; padding:24px; border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 8px; color:#7f1d1d;">Disposisi Baru</h2>
    <p style="margin:0 0 16px; color:#374151;">Halo <strong>${escapeHtml(params.recipientName)}</strong>, ${escapeHtml(params.fromName)} meneruskan surat kepada Anda.</p>
    <table style="width:100%; border-collapse:collapse; color:#111827;">
      <tr><td style="padding:6px 0; color:#6b7280;">Nomor</td><td style="padding:6px 0;"><code>${escapeHtml(params.archiveNumber)}</code></td></tr>
      <tr><td style="padding:6px 0; color:#6b7280;">Perihal</td><td style="padding:6px 0;">${escapeHtml(params.subject)}</td></tr>
      <tr><td style="padding:6px 0; color:#6b7280;">Instruksi</td><td style="padding:6px 0; white-space:pre-wrap;">${escapeHtml(params.instructions)}</td></tr>
      ${params.dueDate ? `<tr><td style="padding:6px 0; color:#6b7280;">Batas waktu</td><td style="padding:6px 0;">${escapeHtml(params.dueDate)}</td></tr>` : ""}
    </table>
    <p style="margin:20px 0 0;"><a href="${link}" style="display:inline-block; padding:10px 16px; background:#991b1b; color:#fff; text-decoration:none; border-radius:8px;">Buka Arsip</a></p>
  </div>
</body></html>`;
  return { html, text };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
