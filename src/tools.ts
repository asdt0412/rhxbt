import { getAddress, isAddress, type Address } from "viem";
import { erc20Abi } from "./abis.js";
import { publicClient } from "./chain.js";
import { config } from "./config.js";
import { stockByTicker, USDG, WETH } from "./constants.js";
import { isUsMarketClosed } from "./marketHours.js";
import { findPool } from "./pools.js";
import { tickerUsd } from "./prices.js";
import type { PoolStats, StockQuote, TokenInfo } from "./types.js";

export const CLAUDE_TOOLS = [
  {
    name: "get_stock_token_price",
    description:
      "Live Chainlink price for a Robinhood Chain stock token plus US cash-market open/closed state (ET).",
    input_schema: {
      type: "object" as const,
      properties: {
        ticker: { type: "string", description: "Equity ticker, e.g. NVDA" },
      },
      required: ["ticker"],
    },
  },
  {
    name: "get_pool_stats",
    description: "Uniswap v3 pool liquidity, 24h volume, and price for a token pair on Robinhood Chain.",
    input_schema: {
      type: "object" as const,
      properties: {
        tokenA: { type: "string", description: "Ticker or 0x address" },
        tokenB: { type: "string", description: "Ticker or 0x address" },
      },
      required: ["tokenA", "tokenB"],
    },
  },
  {
    name: "get_token_info",
    description: "ERC-20 metadata and holder count via Blockscout for a Robinhood Chain token.",
    input_schema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "Token contract address" },
      },
      required: ["address"],
    },
  },
];

function resolveToken(id: string): Address | null {
  const raw = id.trim();
  if (isAddress(raw)) return getAddress(raw);
  const upper = raw.replace(/^\$/, "").toUpperCase();
  if (upper === "WETH" || upper === "ETH") return WETH;
  if (upper === "USDG") return USDG;
  return stockByTicker(upper)?.address ?? null;
}

export async function getStockTokenPrice(ticker: string): Promise<StockQuote | { error: string }> {
  const t = ticker.replace(/^\$/, "").trim().toUpperCase();
  if (t === "HOOD") {
    return { error: "no hood stock token on robinhood chain 4663 — hood is the nasdaq equity ticker" };
  }
  const q = await tickerUsd(t);
  if (!q) return { error: `no chainlink feed for ${t}` };
  return {
    ticker: t,
    priceUsd: Number(q.price.toFixed(4)),
    updatedAt: q.updatedAt,
    marketClosed: isUsMarketClosed(),
    feed: q.feed,
  };
}

export async function getPoolStats(tokenA: string, tokenB: string): Promise<PoolStats | { error: string }> {
  const a = resolveToken(tokenA);
  const b = resolveToken(tokenB);
  if (!a || !b) return { error: `unresolved pair ${tokenA}/${tokenB}` };
  const stats = await findPool(a, b);
  if (!stats) return { error: `no uniswap v3 pool for ${tokenA}/${tokenB}` };
  return {
    ...stats,
    liquidityUsd: Number(stats.liquidityUsd.toFixed(2)),
    volume24hUsd: Number(stats.volume24hUsd.toFixed(2)),
    price: Number(stats.price.toFixed(8)),
  };
}

export async function getTokenInfo(address: string): Promise<TokenInfo | { error: string }> {
  if (!isAddress(address)) return { error: "invalid address" };
  const addr = getAddress(address);
  let name: string | null = null;
  let symbol: string | null = null;
  let decimals: number | null = null;
  let totalSupply: string | null = null;
  try {
    [name, symbol, decimals, totalSupply] = await Promise.all([
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: "name" }),
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" }),
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: "decimals" }).then(Number),
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: "totalSupply" }).then(String),
    ]);
  } catch {
    /* not an erc20 or revert */
  }

  let holders: number | null = null;
  try {
    const url = `${config.blockscoutUrl.replace(/\/$/, "")}/api/v2/tokens/${addr}/counters`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (res.ok) {
      const json = (await res.json()) as { token_holders_count?: string; holders_count?: string };
      const raw = json.token_holders_count ?? json.holders_count;
      if (raw !== undefined) holders = Number(raw);
    }
  } catch {
    /* optional */
  }

  return { address: addr, name, symbol, decimals, holders, totalSupply };
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_stock_token_price":
      return getStockTokenPrice(String(input.ticker ?? ""));
    case "get_pool_stats":
      return getPoolStats(String(input.tokenA ?? ""), String(input.tokenB ?? ""));
    case "get_token_info":
      return getTokenInfo(String(input.address ?? ""));
    default:
      return { error: `unknown tool ${name}` };
  }
}
