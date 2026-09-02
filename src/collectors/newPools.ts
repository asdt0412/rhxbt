import type { Address, WatchEventReturnType } from "viem";
import { poolCreatedEvent } from "../abis.js";
import { getWsClient, publicClient } from "../chain.js";
import { config } from "../config.js";
import { UNI_V3_FACTORY } from "../constants.js";
import { getStore } from "../db.js";
import { queryLogsSafe } from "../hypersync.js";
import { log } from "../logger.js";
import { decodePoolCreated, POOL_CREATED_TOPIC, qualifyPool } from "../pools.js";
import type { Signal } from "../types.js";

const factory = () => (config.uniV3Factory || UNI_V3_FACTORY) as Address;
const CURSOR = "new_pools_from_block";

async function toSignal(pool: Address, token0: Address, token1: Address, fee: number): Promise<Signal | null> {
  const q = await qualifyPool(pool);
  if (!q) return null;
  return {
    type: "new_pool",
    ref: `pool:${pool.toLowerCase()}`,
    value: q.liquidityUsd,
    ticker: q.label,
    meta: {
      pool,
      token0,
      token1,
      fee,
      pair: q.label,
      liquidityUsd: Number(q.liquidityUsd.toFixed(2)),
      volume24hUsd: Number(q.volume24hUsd.toFixed(2)),
      price: Number(q.price.toFixed(8)),
    },
  };
}

export async function collectNewPools(): Promise<Signal[]> {
  const signals: Signal[] = [];
  const store = getStore();
  const latest = await publicClient.getBlockNumber();
  const saved = await store.getKv(CURSOR);
  const lookback = 72_000n; // ~2h at 100ms
  const fromBlock = saved ? BigInt(saved) : latest > lookback ? latest - lookback : 0n;

  const hsLogs = await queryLogsSafe({
    fromBlock: Number(fromBlock),
    toBlock: Number(latest),
    address: factory(),
    topic0: POOL_CREATED_TOPIC,
  });

  type Raw = { token0: Address; token1: Address; fee: number; pool: Address };
  const decoded: Raw[] = [];

  if (hsLogs.length > 0) {
    for (const row of hsLogs) {
      const ev = decodePoolCreated({
        data: row.data as `0x${string}`,
        topics: row.topics as `0x${string}`[],
      });
      if (ev) decoded.push(ev);
    }
  } else {
    const logs = await publicClient.getLogs({
      address: factory(),
      event: poolCreatedEvent,
      fromBlock,
      toBlock: latest,
    });
    for (const ev of logs) {
      if (!ev.args.token0 || !ev.args.token1 || !ev.args.pool || ev.args.fee === undefined) continue;
      decoded.push({
        token0: ev.args.token0,
        token1: ev.args.token1,
        fee: Number(ev.args.fee),
        pool: ev.args.pool,
      });
    }
  }

  for (const ev of decoded) {
    const sig = await toSignal(ev.pool, ev.token0, ev.token1, ev.fee);
    if (sig) signals.push(sig);
  }

  await store.setKv(CURSOR, latest.toString());
  log.info("new pools scanned", { fromBlock: fromBlock.toString(), found: decoded.length, qualified: signals.length });
  return signals;
}

export function watchNewPools(onSignal: (signal: Signal) => void): () => void {
  const client = getWsClient();
  if (!client) {
    log.warn("no ws client — skipping realtime new-pool watch");
    return () => undefined;
  }

  let unwatch: WatchEventReturnType | undefined;
  try {
    unwatch = client.watchEvent({
      address: factory(),
      event: poolCreatedEvent,
      onLogs: (logs) => {
        void (async () => {
          for (const ev of logs) {
            const { pool, token0, token1, fee } = ev.args;
            if (!pool || !token0 || !token1 || fee === undefined) continue;
            try {
              const sig = await toSignal(pool, token0, token1, Number(fee));
              if (sig) onSignal(sig);
            } catch (err) {
              log.warn("realtime pool handle failed", { err: String(err) });
            }
          }
        })();
      },
      onError: (err) => log.warn("pool watch error", { err: String(err) }),
    });
    log.info("watching PoolCreated over ws");
  } catch (err) {
    log.warn("failed to subscribe PoolCreated", { err: String(err) });
  }

  return () => {
    try {
      unwatch?.();
    } catch {
      /* ignore */
    }
  };
}
