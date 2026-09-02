import { config } from "../config.js";
import { tokenLabel } from "../constants.js";
import { queryRawEvents } from "../ingest/eventStore.js";
import { contractRedFlags, sellSimulates } from "../honeypot.js";
import { qualifyPool } from "../pools.js";
import type { Address } from "viem";
import type { Signal } from "../types.js";

export async function collectLaunches(): Promise<Signal[]> {
  const events = await queryRawEvents({ names: ["PoolCreated", "Mint"], limit: 120 });
  const signals: Signal[] = [];
  const seenPools = new Set<string>();

  for (const ev of events) {
    if (ev.eventName !== "PoolCreated") continue;
    const pool = String(ev.args.pool ?? "").toLowerCase();
    if (!pool || seenPools.has(pool)) continue;
    seenPools.add(pool);
    const token0 = String(ev.args.token0 ?? "") as Address;
    const token1 = String(ev.args.token1 ?? "") as Address;
    const fee = Number(ev.args.fee ?? 0);
    const q = await qualifyPool(pool as Address);
    const pair = q?.label ?? `${tokenLabel(token0)}/${tokenLabel(token1)}`;
    const liq = q?.liquidityUsd ?? 0;
    const vol = q?.volume24hUsd ?? 0;
    if (liq < config.minLiquidityUsd || vol <= 0) continue;

    const mints = events.filter((e) => e.eventName === "Mint" && e.address === pool);
    const firstLiq = mints.length <= 1;
    const graduated = liq >= config.graduationUsd;

    signals.push({
      beat: "launches",
      type: graduated ? "graduation" : firstLiq ? "first_liq" : "new_pool",
      ticker: pair,
      ref: `launch:${pool}`,
      value: liq,
      meta: {
        pool,
        pair,
        fee,
        liquidityUsd: Number(liq.toFixed(2)),
        volume24hUsd: Number(vol.toFixed(2)),
        firstLiquidity: firstLiq,
        graduated,
      },
    });

    const flags = [
      ...(await contractRedFlags(token0)),
      ...(await contractRedFlags(token1)),
    ];
    const canSell0 = await sellSimulates(token0, fee);
    const canSell1 = await sellSimulates(token1, fee);
    if (flags.includes("unverified") || !canSell0 || !canSell1) {
      signals.push({
        beat: "liquidity",
        type: "honeypot",
        ticker: pair,
        ref: `honeypot:${pool}`,
        value: liq,
        meta: { pool, pair, flags, canSell0, canSell1 },
      });
    }
  }
  return signals;
}
