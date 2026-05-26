// Simple in-memory rate limiter for serverless environments.
//
// Uses a Map keyed by IP (or email) with sliding-window counters. This is
// intentionally kept in-process: on Vercel's serverless model each cold-start
// gets a fresh Map, but during warm invocations the counter persists. For
// university-scale traffic this provides meaningful brute-force protection
// without requiring an external store like Redis.
//
// For production at scale, replace this with @upstash/ratelimit or a
// Vercel Edge middleware that checks against a Redis-backed counter.

interface Entry {
  count: number;
  resetAt: number; // epoch ms
}

const store = new Map<string, Entry>();

// Prune stale entries every 5 minutes to prevent unbounded memory growth.
const PRUNE_INTERVAL = 5 * 60 * 1000;
let lastPrune = Date.now();

function pruneIfNeeded() {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL) return;
  lastPrune = now;
  store.forEach((entry, key) => {
    if (now >= entry.resetAt) store.delete(key);
  });
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check and consume a rate-limit token.
 *
 * @param key     Unique identifier (e.g. IP address, email)
 * @param limit   Max requests allowed in the window
 * @param windowMs Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  pruneIfNeeded();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    // First request or window expired — start fresh.
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Extract client IP from request headers (Vercel / Cloudflare / nginx).
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ── Presets ──────────────────────────────────────────────────────────────

/** Login: 10 attempts per IP per 15 minutes */
export function checkLoginRate(req: Request): RateLimitResult {
  const ip = getClientIp(req);
  return rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
}

/** Register: 5 attempts per IP per hour */
export function checkRegisterRate(req: Request): RateLimitResult {
  const ip = getClientIp(req);
  return rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
}

/** Password reset request: 5 per IP per 15 minutes */
export function checkPasswordResetRate(req: Request): RateLimitResult {
  const ip = getClientIp(req);
  return rateLimit(`pwd-reset:${ip}`, 5, 15 * 60 * 1000);
}

/**
 * Return a 429 JSON response with Retry-After header.
 */
export function rateLimitResponse(result: RateLimitResult) {
  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
  return new Response(
    JSON.stringify({
      error: "Terlalu banyak percobaan. Silakan coba lagi nanti.",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
