import type { Beat } from "../types.js";

/** Anti-spam ceilings per beat per UTC hour. Never a minimum — most look ticks post nothing. */
export const HOURLY_QUOTAS: Record<Beat, number> = {
  launches: 4,
  liquidity: 3,
  stockTokens: 6,
  whales: 4,
  bridge: 2,
  protocols: 2,
  vitals: 1,
  narrative: 2,
};

export function hourKey(at = new Date()): string {
  return at.toISOString().slice(0, 13);
}

export function etDateKey(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
