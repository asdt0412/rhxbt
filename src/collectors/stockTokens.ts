import { config } from "../config.js";
import { STOCK_TOKENS } from "../constants.js";
import { getStore } from "../db.js";
import { log } from "../logger.js";
import { isUsMarketClosed } from "../marketHours.js";
import { readFeedUsd } from "../prices.js";
import type { Signal } from "../types.js";

type Snapshot = {
  price: number;
  updatedAt: number;
  marketClosed: boolean;
  closeAnchor?: number;
};

const SNAP_KEY = "stock_snapshots_v1";

async function loadSnapshots(): Promise<Record<string, Snapshot>> {
  const raw = await getStore().getKv(SNAP_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, Snapshot>;
  } catch {
    return {};
  }
}

async function saveSnapshots(snaps: Record<string, Snapshot>): Promise<void> {
  await getStore().setKv(SNAP_KEY, JSON.stringify(snaps));
}

export async function collectStockTokens(now: Date = new Date()): Promise<Signal[]> {
  const marketClosed = isUsMarketClosed(now);
  const snaps = await loadSnapshots();
  const signals: Signal[] = [];
  const threshold = config.stockMoveThresholdPct;

  for (const token of STOCK_TOKENS) {
    try {
      const quote = await readFeedUsd(token.feed);
      const prev = snaps[token.ticker];
      let closeAnchor = prev?.closeAnchor;
      if (marketClosed) {
        if (prev && !prev.marketClosed) closeAnchor = prev.price;
        if (closeAnchor === undefined) closeAnchor = quote.price;
      } else {
        closeAnchor = undefined;
      }

      const baseline = marketClosed && closeAnchor !== undefined ? closeAnchor : prev?.price;
      const changePct =
        baseline && baseline > 0 ? ((quote.price - baseline) / baseline) * 100 : undefined;

      snaps[token.ticker] = {
        price: quote.price,
        updatedAt: quote.updatedAt,
        marketClosed,
        closeAnchor,
      };

      if (changePct === undefined || Math.abs(changePct) < threshold) continue;

      const bucket = (Math.round(changePct * 10) / 10).toFixed(1);
      const session = marketClosed ? "closed" : "open";
      const hour = now.toISOString().slice(0, 13);
      const ref = `stock:${token.ticker}:${session}:${bucket}:${hour}`;

      signals.push({
        type: "stock_move",
        ticker: token.ticker,
        ref,
        value: changePct,
        meta: {
          price: Number(quote.price.toFixed(4)),
          changePct: Number(changePct.toFixed(3)),
          marketClosed,
          baseline: Number(baseline!.toFixed(4)),
          feed: token.feed,
          token: token.address,
          since: marketClosed ? "nyse_close" : "last_print",
        },
      });
    } catch (err) {
      log.warn("stock token read failed", { ticker: token.ticker, err: String(err) });
    }
  }

  await saveSnapshots(snaps);

  signals.sort((a, b) => {
    const aClosed = a.meta.marketClosed === true ? 1 : 0;
    const bClosed = b.meta.marketClosed === true ? 1 : 0;
    if (aClosed !== bClosed) return bClosed - aClosed;
    return Math.abs(b.value) - Math.abs(a.value);
  });

  return signals;
}
