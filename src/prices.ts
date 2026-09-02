import { formatUnits, type Address } from "viem";
import { aggregatorV3Abi } from "./abis.js";
import { publicClient } from "./chain.js";
import { CRYPTO_FEEDS, stockByAddress, stockByTicker, USDG, WETH } from "./constants.js";
import { log } from "./logger.js";

export async function readFeedUsd(feed: Address): Promise<{ price: number; updatedAt: number; decimals: number }> {
  const [round, decimals] = await Promise.all([
    publicClient.readContract({
      address: feed,
      abi: aggregatorV3Abi,
      functionName: "latestRoundData",
    }),
    publicClient.readContract({
      address: feed,
      abi: aggregatorV3Abi,
      functionName: "decimals",
    }),
  ]);
  const answer = round[1];
  const updatedAt = Number(round[3]);
  if (answer <= 0n) throw new Error(`invalid feed answer at ${feed}`);
  const price = Number(formatUnits(answer, decimals));
  if (!Number.isFinite(price) || price <= 0) throw new Error(`non-finite feed price at ${feed}`);
  return { price, updatedAt, decimals };
}

const tokenUsdCache = new Map<string, { price: number; exp: number }>();

export async function tokenUsd(address: Address): Promise<number | null> {
  const key = address.toLowerCase();
  const hit = tokenUsdCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.price;

  try {
    let price: number | null = null;
    if (key === USDG.toLowerCase()) {
      price = (await readFeedUsd(CRYPTO_FEEDS.USDG_USD)).price;
    } else if (key === WETH.toLowerCase()) {
      price = (await readFeedUsd(CRYPTO_FEEDS.ETH_USD)).price;
    } else {
      const stock = stockByAddress(address);
      if (stock) price = (await readFeedUsd(stock.feed)).price;
    }
    if (price === null) return null;
    tokenUsdCache.set(key, { price, exp: Date.now() + 30_000 });
    return price;
  } catch (err) {
    log.warn("token usd lookup failed", { address, err: String(err) });
    return null;
  }
}

export async function tickerUsd(ticker: string): Promise<{ price: number; updatedAt: number; feed: Address } | null> {
  const stock = stockByTicker(ticker);
  if (!stock) return null;
  const q = await readFeedUsd(stock.feed);
  return { price: q.price, updatedAt: q.updatedAt, feed: stock.feed };
}
