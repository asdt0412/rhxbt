import { config } from "../config.js";
import { log } from "../logger.js";
import { STOCK_TOKENS } from "../constants.js";
import { getStore } from "../db.js";
import { isUsMarketClosed } from "../marketHours.js";
import { readFeedUsd } from "../prices.js";
import type { Signal } from "../types.js";
import { etDateKey } from "./defs.js";

export type VitalsSnapshot = {
  date: string;
  txCount?: number;
  addresses?: number;
  avgBlockTime?: number;
  gasGwei?: number;
  coinPrice?: number;
  tvlHint?: number;
  topMovers: Array<{ ticker: string; changePct: number; price: number }>;
};

export async function fetchChainStats(): Promise<Record<string, unknown> | null> {
  try {
    const url = `${config.blockscoutUrl.replace(/\/$/, "")}/api/v2/stats`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    log.warn("blockscout stats failed", { err: String(err) });
    return null;
  }
}

export async function collectVitals(now = new Date()): Promise<Signal[]> {
  const stats = await fetchChainStats();
  const movers: VitalsSnapshot["topMovers"] = [];
  for (const token of STOCK_TOKENS) {
    try {
      const q = await readFeedUsd(token.feed);
      movers.push({ ticker: token.ticker, changePct: 0, price: q.price });
    } catch {
      /* skip */
    }
  }

  const snap: VitalsSnapshot = {
    date: etDateKey(now),
    txCount: num(stats?.total_transactions ?? stats?.transactions_today),
    addresses: num(stats?.total_addresses),
    avgBlockTime: num(stats?.average_block_time),
    gasGwei: num(
      (stats?.gas_prices as { average?: number } | undefined)?.average ?? stats?.gas_price,
    ),
    coinPrice: num(stats?.coin_price),
    topMovers: movers.sort((a, b) => b.price - a.price).slice(0, 5),
  };

  await getStore().setKv("vitals_latest", JSON.stringify(snap));

  return [
    {
      beat: "vitals",
      type: "vitals",
      ref: `vitals:${snap.date}:${now.toISOString().slice(0, 13)}`,
      value: snap.txCount ?? 0,
      meta: { ...snap, marketClosed: isUsMarketClosed(now) },
    },
  ];
}

export async function buildDailyRecap(now = new Date()): Promise<Signal | null> {
  const date = etDateKey(now);
  const store = getStore();
  if ((await store.getKv(`recap:${date}`)) === "1") return null;
  const vitals = await collectVitals(now);
  const v = vitals[0];
  if (!v) return null;
  return {
    ...v,
    type: "recap",
    ref: `recap:${date}`,
    meta: { ...v.meta, recap: true },
  };
}

export async function markRecapPosted(date: string): Promise<void> {
  await getStore().setKv(`recap:${date}`, "1");
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
