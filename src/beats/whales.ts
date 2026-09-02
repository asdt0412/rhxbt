import { formatUnits } from "viem";
import { config } from "../config.js";
import { stockByAddress, STOCK_TOKENS, tokenLabel, USDG, WETH } from "../constants.js";
import { queryRawEvents } from "../ingest/eventStore.js";
import { tokenUsd } from "../prices.js";
import type { Address } from "viem";
import type { Signal } from "../types.js";

function decimalsFor(address: string): number {
  if (address.toLowerCase() === USDG.toLowerCase()) return 6;
  return 18;
}

export async function collectWhales(): Promise<Signal[]> {
  const events = await queryRawEvents({ names: ["Transfer"], limit: 400 });
  const tracked = new Set(config.trackedWallets);
  const known = new Set(
    [USDG, WETH, ...STOCK_TOKENS.map((t) => t.address)].map((a) => a.toLowerCase()),
  );
  const signals: Signal[] = [];

  for (const ev of events) {
    if (!known.has(ev.address.toLowerCase())) continue;
    const from = String(ev.args.from ?? "").toLowerCase();
    const to = String(ev.args.to ?? "").toLowerCase();
    const raw = BigInt(String(ev.args.value ?? "0"));
    const dec = decimalsFor(ev.address);
    const amount = Number(formatUnits(raw, dec));
    const px = await tokenUsd(ev.address as Address);
    const usd = px ? amount * px : 0;
    const watched = tracked.has(from) || tracked.has(to);
    if (!watched && usd < config.whaleUsd) continue;
    const ticker = stockByAddress(ev.address)?.ticker ?? tokenLabel(ev.address);
    signals.push({
      beat: "whales",
      type: "whale_transfer",
      ticker,
      ref: `whale:${ev.id}`,
      value: usd || amount,
      meta: {
        token: ev.address,
        ticker,
        from,
        to,
        amount,
        usd: Number(usd.toFixed(0)),
        tracked: watched,
        mint: ev.args.mint === true,
        burn: ev.args.burn === true,
      },
    });
  }
  return signals;
}
