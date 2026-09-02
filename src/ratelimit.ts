import { ApiResponseError } from "twitter-api-v2";
import { log } from "./logger.js";
import type { RateLimitState } from "./types.js";

export type XRateHeaders = {
  remaining?: number;
  reset?: number;
  limit?: number;
};

const state: RateLimitState = { remaining: null, resetAt: null, ok: true };

export function rateLimitOk(): boolean {
  return state.ok && (state.remaining === null || state.remaining > 1);
}

export function getRateLimitState(): RateLimitState {
  return { ...state };
}

export function noteRateLimit(headers: XRateHeaders | undefined | null): void {
  if (!headers) return;
  if (typeof headers.remaining === "number") state.remaining = headers.remaining;
  if (typeof headers.reset === "number") {
    state.resetAt = headers.reset < 1e12 ? headers.reset * 1000 : headers.reset;
  }
  state.ok = state.remaining === null || state.remaining > 1;
}

export async function sleepUntilReset(): Promise<void> {
  const resetAt = state.resetAt ?? Date.now() + 15_000;
  const wait = Math.max(1_000, Math.min(resetAt - Date.now() + 500, 16 * 60_000));
  log.warn("x rate limit — sleeping", { waitMs: wait, remaining: state.remaining });
  await sleep(wait);
  state.ok = true;
  state.remaining = null;
}

export async function beforeXCall(): Promise<void> {
  if (state.remaining !== null && state.remaining <= 1) {
    await sleepUntilReset();
  }
}

export async function withXRateLimit<T>(fn: () => Promise<T>): Promise<T | null> {
  let attempt = 0;
  const max = 5;
  while (attempt < max) {
    await beforeXCall();
    try {
      return await fn();
    } catch (err) {
      if (is429(err)) {
        attempt += 1;
        const backoff = Math.min(60_000, 1000 * 2 ** attempt);
        const reset = resetFromError(err);
        if (reset) state.resetAt = reset;
        state.ok = false;
        state.remaining = 0;
        log.warn("x 429 — backing off", { attempt, backoff });
        await sleep(backoff);
        continue;
      }
      log.error("x call failed", { err: String(err) });
      return null;
    }
  }
  log.error("x 429 persisted — giving up this cycle");
  return null;
}

function is429(err: unknown): boolean {
  if (err instanceof ApiResponseError) return err.code === 429 || err.rateLimitError;
  if (err && typeof err === "object" && "code" in err) return (err as { code: number }).code === 429;
  return false;
}

function resetFromError(err: unknown): number | null {
  if (err instanceof ApiResponseError && err.rateLimit?.reset) {
    return err.rateLimit.reset * 1000;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
