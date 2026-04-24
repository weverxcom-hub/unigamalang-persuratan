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
 * update the row with the outcome. Never throws from the caller's viewpoint.
 */
export async function fireWebhook(
  payload: WebhookPayload,
  opts?: { tx?: Prisma.TransactionClient }
): Promise<void> {
  const client = opts?.tx ?? prisma;
  const body = JSON.stringify(payload);
  const signature = SIGNING_SECRET ? sign(body) : "";
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

  try {
    const res = await fetch(TARGET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
        "X-Signature-Algorithm": "sha256",
        "X-Event": payload.event,
      },
      body,
    });
    await client.webhookDelivery.update({
      where: { id: row.id },
      data: {
        status: res.ok ? "SUCCESS" : "FAILED",
        responseStatus: res.status,
        lastError: res.ok ? null : await res.text().catch(() => null),
        attempts: { increment: 1 },
      },
    });
  } catch (e) {
    await client.webhookDelivery.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        lastError: e instanceof Error ? e.message : String(e),
        attempts: { increment: 1 },
      },
    });
  }
}
