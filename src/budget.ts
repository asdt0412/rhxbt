import { config } from "./config.js";
import { countReplies } from "./db.js";
import { log } from "./logger.js";

export type BudgetSnapshot = {
  per15min: { used: number; cap: number };
  perDay: { used: number; cap: number };
  perMonth: { used: number; cap: number };
};

export async function budgetSnapshot(): Promise<BudgetSnapshot> {
  const [per15, perDay, perMonth] = await Promise.all([
    countReplies("15min"),
    countReplies("day"),
    countReplies("month"),
  ]);
  return {
    per15min: { used: per15, cap: config.maxRepliesPer15Min },
    perDay: { used: perDay, cap: config.maxRepliesPerDay },
    perMonth: { used: perMonth, cap: config.maxRepliesPerMonth },
  };
}

/** True only if all three windows are strictly under cap. Cap 0 ⇒ never reply. */
export function budgetAllows(snap: BudgetSnapshot): boolean {
  return (
    snap.per15min.used < snap.per15min.cap &&
    snap.perDay.used < snap.perDay.cap &&
    snap.perMonth.used < snap.perMonth.cap
  );
}

export async function canReply(): Promise<boolean> {
  const snap = await budgetSnapshot();
  const ok = budgetAllows(snap);
  if (!ok) log.info("reply budget exhausted", snap);
  return ok;
}
