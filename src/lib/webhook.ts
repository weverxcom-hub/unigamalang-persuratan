// Outbound webhook delivery for n8n / Zapier / etc.
//
// Every payload is HMAC-SHA256 signed with WEBHOOK_SIGNING_SECRET so the
// receiver can verify authenticity. A WebhookDelivery row is persisted for
// every attempt (regardless of success) so failures are auditable.

import crypto from "node:crypto";
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

const TARGET_URL = process.env.N8N_WEBHOOK_URL ?? "";
const SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET ?? "";

export const WEBHOOK_AVAILABLE = !!TARGET_URL;

export interface WebhookPayload {
  event: string;
  archiveId?: string;
  [k: string]: unknown;
}

export function sign(body: string, secret = SIGNING_SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Fire-and-forget webhook delivery. Persist a row, attempt the POST, and
 * update the row with the outcome. Never throws from the caller's viewpoint —
 * the entire body is wrapped so that DB outages, fetch failures, etc. all
 * surface as console warnings instead of unhandled rejections.
 */
export async function fireWebhook(
  payload: WebhookPayload,
  opts?: { tx?: Prisma.TransactionClient }
): Promise<void> {
  const client = opts?.tx ?? prisma;
  const body = JSON.stringify(payload);
  const signature = SIGNING_SECRET ? sign(body) : "";

  let rowId: string | null = null;
  try {
    const row = await client.webhookDelivery.create({
      data: {
        event: payload.event,
        archiveId: payload.archiveId ?? null,
        targetUrl: TARGET_URL || "(unset)",
        payload: JSON.parse(body),
        signature,
        status: "PENDING",
      },
    });
    rowId = row.id;

    if (!TARGET_URL) {
      await client.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          lastError: "N8N_WEBHOOK_URL is not configured",
          attempts: { increment: 1 },
        },
      });
      return;
    }

    let res: Response | null = null;
    let fetchError: unknown = null;
    try {
      res = await fetch(TARGET_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
          "X-Signature-Algorithm": "sha256",
          "X-Event": payload.event,
        },
        body,
      });
    } catch (e) {
      fetchError = e;
    }

    if (res) {
      await client.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: res.ok ? "SUCCESS" : "FAILED",
          responseStatus: res.status,
          lastError: res.ok ? null : await res.text().catch(() => null),
          attempts: { increment: 1 },
        },
      });
    } else {
      await client.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          lastError: fetchError instanceof Error ? fetchError.message : String(fetchError),
          attempts: { increment: 1 },
        },
      });
    }
  } catch (e) {
    // Last-resort safety net: if the row create/update itself failed (e.g. DB
    // outage), don't propagate to the caller.
    console.warn("[fireWebhook] swallowed unexpected error", { rowId, err: e });
  }
}
