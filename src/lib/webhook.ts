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

/** Max retry attempts for failed webhook deliveries */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms): 1s, 2s, 4s */
const BASE_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

    // Retry loop with exponential backoff (1s, 2s, 4s)
    let lastError: string | null = null;
    let lastStatus: number | null = null;
    let succeeded = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await delay(BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }

      let res: Response | null = null;
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
        lastError = e instanceof Error ? e.message : String(e);
        lastStatus = null;
        // Increment attempt counter in DB
        await client.webhookDelivery.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 }, lastError },
        }).catch(() => {});
        continue;
      }

      lastStatus = res.status;
      if (res.ok) {
        succeeded = true;
        await client.webhookDelivery.update({
          where: { id: row.id },
          data: {
            status: "SUCCESS",
            responseStatus: res.status,
            lastError: null,
            attempts: { increment: 1 },
          },
        });
        break;
      }

      // Non-retryable status codes (4xx except 429)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        lastError = await res.text().catch(() => `HTTP ${res!.status}`);
        await client.webhookDelivery.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            responseStatus: res.status,
            lastError,
            attempts: { increment: 1 },
          },
        });
        break;
      }

      // Retryable failure (5xx or 429)
      lastError = await res.text().catch(() => `HTTP ${res!.status}`);
      await client.webhookDelivery.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 }, lastError },
      }).catch(() => {});
    }

    // Final status update if all retries exhausted
    if (!succeeded && lastError) {
      await client.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          responseStatus: lastStatus,
          lastError: `[after ${MAX_RETRIES} attempts] ${lastError}`,
        },
      }).catch(() => {});
    }
  } catch (e) {
    // Last-resort safety net: if the row create/update itself failed (e.g. DB
    // outage), don't propagate to the caller.
    console.warn("[fireWebhook] swallowed unexpected error", { rowId, err: e });
  }
}
