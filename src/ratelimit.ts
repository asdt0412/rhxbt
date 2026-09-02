import { ApiResponseError } from "twitter-api-v2";
import { log } from "./logger.js";
import type { RateLimitState } from "./types.js";

export type XLane = "news" | "reply";

export type XRateHeaders = {
  remaining?: number;
  reset?: number;
  limit?: number;
};

const lanes: Record<XLane, RateLimitState> = {
  news: { remaining: null, resetAt: null, ok: true },
  reply: { remaining: null, resetAt: null, ok: true },
};

export function rateLimitOk(lane: XLane = "reply"): boolean {
  const state = lanes[lane];
  return state.ok && (state.remaining === null || state.remaining > 1);
}

export function getRateLimitState(lane: XLane = "reply"): RateLimitState {
  return { ...lanes[lane] };
}

export function noteRateLimit(headers: XRateHeaders | undefined | null, lane: XLane): void {
  if (!headers) return;
  const state = lanes[lane];
  if (typeof headers.remaining === "number") state.remaining = headers.remaining;
  if (typeof headers.reset === "number") {
    state.resetAt = headers.reset < 1e12 ? headers.reset * 1000 : headers.reset;
  }
  state.ok = state.remaining === null || state.remaining > 1;
}

export async function sleepUntilReset(lane: XLane): Promise<void> {
  const state = lanes[lane];
  const resetAt = state.resetAt ?? Date.now() + 15_000;
  const wait = Math.max(1_000, Math.min(resetAt - Date.now() + 500, 16 * 60_000));
  log.warn("x rate limit — sleeping", { lane, waitMs: wait, remaining: state.remaining });
  await sleep(wait);
  state.ok = true;
  state.remaining = null;
}

export async function beforeXCall(lane: XLane): Promise<void> {
  const state = lanes[lane];
  if (state.remaining !== null && state.remaining <= 1) {
    await sleepUntilReset(lane);
  }
}

export async function withXRateLimit<T>(fn: () => Promise<T>, lane: XLane): Promise<T | null> {
  const state = lanes[lane];
  let attempt = 0;
  const max = 5;
  while (attempt < max) {
    await beforeXCall(lane);
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
        log.warn("x 429 — backing off", { lane, attempt, backoff });
        await sleep(backoff);
        continue;
      }
      log.error("x call failed", { lane, err: String(err) });
      return null;
    }
  }
  log.error("x 429 persisted — giving up this cycle", { lane });
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
