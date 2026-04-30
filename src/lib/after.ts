import { waitUntil } from "@vercel/functions";

/**
 * Run a fire-and-forget post-response side effect.
 *
 * On Vercel serverless we MUST use `waitUntil()` so the runtime keeps the
 * function alive until the promise settles; otherwise emails / webhooks /
 * Drive renames silently get dropped after the response is flushed.
 *
 * Errors are caught and logged so they never reject the registered promise
 * (which would surface as an unhandled rejection in the platform).
 */
export function runAfter(label: string, fn: () => Promise<unknown>): void {
  const p = (async () => {
    try {
      await fn();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[after:${label}] failed`, e);
    }
  })();
  try {
    waitUntil(p);
  } catch {
    // Outside the Vercel runtime (local dev, tests) waitUntil may throw —
    // the promise is already running and will be awaited by the event loop.
  }
}
