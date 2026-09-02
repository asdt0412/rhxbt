import { getStore } from "../db.js";
import type { Beat, Signal } from "../types.js";
import { HOURLY_QUOTAS, hourKey } from "./defs.js";

/** Drop signals whose beat is already at its hourly ceiling. Does not force a post. */
export async function applyHourlyQuotas(signals: Signal[], at = new Date()): Promise<Signal[]> {
  const store = getStore();
  const hour = hourKey(at);
  const used = new Map<Beat, number>();
  const out: Signal[] = [];
  for (const s of signals) {
    const already = used.get(s.beat) ?? (await store.countBeatPosts(s.beat, hour));
    const cap = HOURLY_QUOTAS[s.beat];
    if (already >= cap) continue;
    used.set(s.beat, already + 1);
    out.push(s);
  }
  return out;
}

export async function noteBeatPost(signal: Signal, at = new Date()): Promise<void> {
  await getStore().recordBeatPost(signal.beat, signal.ref, hourKey(at));
}
