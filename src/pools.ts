import { decodeEventLog, formatUnits, keccak256, toHex, zeroAddress, type Address } from "viem";
import { erc20Abi, swapEvent, uniV3FactoryAbi, uniV3PoolAbi } from "./abis.js";
import { publicClient } from "./chain.js";
import { config } from "./config.js";
import { FEE_TIERS, tokenLabel, UNI_V3_FACTORY } from "./constants.js";
import { log } from "./logger.js";
import { tokenUsd } from "./prices.js";
import type { PoolStats } from "./types.js";

export const POOL_CREATED_TOPIC = keccak256(toHex("PoolCreated(address,address,uint24,int24,address)"));

export type DecodedPoolCreated = {
  token0: Address;
  token1: Address;
  fee: number;
  pool: Address;
  tickSpacing?: number;
};

export function decodePoolCreated(logRow: {
  data: `0x${string}`;
  topics: [`0x${string}`, ...`0x${string}`[]] | `0x${string}`[];
}): DecodedPoolCreated | null {
  try {
    const decoded = decodeEventLog({
      abi: uniV3FactoryAbi,
      eventName: "PoolCreated",
      data: logRow.data,
      topics: logRow.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    const { token0, token1, fee, pool, tickSpacing } = decoded.args;
    return {
      token0,
      token1,
      fee: Number(fee),
      pool,
      tickSpacing: Number(tickSpacing),
    };
  } catch {
    return null;
  }
}

export async function poolLiquidityUsd(pool: Address): Promise<{
  token0: Address;
  token1: Address;
  fee: number;
  liquidityUsd: number;
  price: number;
  bal0: number;
  bal1: number;
} | null> {
  try {
    const [token0, token1, fee, dec0, dec1] = await Promise.all([
      publicClient.readContract({ address: pool, abi: uniV3PoolAbi, functionName: "token0" }),
      publicClient.readContract({ address: pool, abi: uniV3PoolAbi, functionName: "token1" }),
      publicClient.readContract({ address: pool, abi: uniV3PoolAbi, functionName: "fee" }),
      publicClient
        .readContract({ address: pool, abi: uniV3PoolAbi, functionName: "token0" })
        .then((t) => publicClient.readContract({ address: t, abi: erc20Abi, functionName: "decimals" })),
      publicClient
        .readContract({ address: pool, abi: uniV3PoolAbi, functionName: "token1" })
        .then((t) => publicClient.readContract({ address: t, abi: erc20Abi, functionName: "decimals" })),
    ]);

    const [raw0, raw1, px0, px1] = await Promise.all([
      publicClient.readContract({ address: token0, abi: erc20Abi, functionName: "balanceOf", args: [pool] }),
      publicClient.readContract({ address: token1, abi: erc20Abi, functionName: "balanceOf", args: [pool] }),
      tokenUsd(token0),
      tokenUsd(token1),
    ]);

    const bal0 = Number(formatUnits(raw0, dec0));
    const bal1 = Number(formatUnits(raw1, dec1));
    const usd0 = px0 !== null ? bal0 * px0 : null;
    const usd1 = px1 !== null ? bal1 * px1 : null;

    let liquidityUsd = 0;
    if (usd0 !== null && usd1 !== null) liquidityUsd = usd0 + usd1;
    else if (usd0 !== null) liquidityUsd = usd0 * 2;
    else if (usd1 !== null) liquidityUsd = usd1 * 2;
    else return null;

    let price = 0;
    if (bal0 > 0 && px0 && px1) price = px0 / px1;
    else if (bal0 > 0) price = bal1 / bal0;

    return { token0, token1, fee: Number(fee), liquidityUsd, price, bal0, bal1 };
  } catch (err) {
    log.warn("pool liquidity read failed", { pool, err: String(err) });
    return null;
  }
}

export async function poolVolume24hUsd(pool: Address, token0: Address, token1: Address): Promise<number> {
  try {
    const latest = await publicClient.getBlockNumber();
    const blocksPerDay = 864_000n; // ~100ms blocks
    const from = latest > blocksPerDay ? latest - blocksPerDay : 0n;
    const logs = await publicClient.getLogs({
      address: pool,
      event: swapEvent,
      fromBlock: from,
      toBlock: latest,
    });
    if (logs.length === 0) return 0;

    const [px0, px1] = await Promise.all([tokenUsd(token0), tokenUsd(token1)]);
    const [dec0, dec1] = await Promise.all([
      publicClient.readContract({ address: token0, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({ address: token1, abi: erc20Abi, functionName: "decimals" }),
    ]);

    let usd = 0;
    for (const ev of logs) {
      try {
        const amount0 = ev.args.amount0;
        const amount1 = ev.args.amount1;
        if (amount0 === undefined || amount1 === undefined) continue;
        const a0 = Math.abs(Number(formatUnits(amount0, dec0)));
        const a1 = Math.abs(Number(formatUnits(amount1, dec1)));
        if (px1 !== null) usd += a1 * px1;
        else if (px0 !== null) usd += a0 * px0;
        else usd += a1 + a0;
      } catch {
        usd += 1;
      }
    }
    return usd;
  } catch (err) {
    log.warn("pool volume read failed", { pool, err: String(err) });
    return 0;
  }
}

export async function qualifyPool(pool: Address): Promise<{
  token0: Address;
  token1: Address;
  fee: number;
  liquidityUsd: number;
  volume24hUsd: number;
  price: number;
  label: string;
} | null> {
  const liq = await poolLiquidityUsd(pool);
  if (!liq) return null;
  if (liq.liquidityUsd < config.minLiquidityUsd) return null;
  const volume24hUsd = await poolVolume24hUsd(pool, liq.token0, liq.token1);
  if (volume24hUsd <= 0) return null;
  return {
    ...liq,
    volume24hUsd,
    label: `${tokenLabel(liq.token0)}/${tokenLabel(liq.token1)}`,
  };
}

export async function findPool(tokenA: Address, tokenB: Address): Promise<PoolStats | null> {
  const factory = (config.uniV3Factory || UNI_V3_FACTORY) as Address;
  let best: PoolStats | null = null;
  for (const fee of FEE_TIERS) {
    const pool = await publicClient.readContract({
      address: factory,
      abi: uniV3FactoryAbi,
      functionName: "getPool",
      args: [tokenA, tokenB, fee],
    });
    if (pool === zeroAddress) continue;
    const liq = await poolLiquidityUsd(pool);
    if (!liq) continue;
    const volume24hUsd = await poolVolume24hUsd(pool, liq.token0, liq.token1);
    const stats: PoolStats = {
      pool,
      tokenA: liq.token0,
      tokenB: liq.token1,
      fee,
      liquidityUsd: liq.liquidityUsd,
      volume24hUsd,
      price: liq.price,
    };
    if (!best || stats.liquidityUsd > best.liquidityUsd) best = stats;
  }
  return best;
}
