import { config } from "../config.js";
import { queryRawEvents } from "../ingest/eventStore.js";
import { tokenUsd } from "../prices.js";
import { USDG, WETH } from "../constants.js";
import type { Signal } from "../types.js";

export async function collectLiquidity(): Promise<Signal[]> {
  const events = await queryRawEvents({ names: ["Mint", "Burn"], limit: 200 });
  const [pxEth, pxUsdg] = await Promise.all([tokenUsd(WETH), tokenUsd(USDG)]);
  const signals: Signal[] = [];

  for (const ev of events) {
    const a0 = Number(ev.args.amount0 ?? 0);
    const a1 = Number(ev.args.amount1 ?? 0);
    const usd = (pxEth ? a0 * 1e-18 * pxEth : 0) + (pxUsdg ? a1 * 1e-6 * pxUsdg : 0);
    if (usd < config.liqPullUsd) continue;
    const pull = ev.eventName === "Burn";
    signals.push({
      beat: "liquidity",
      type: pull ? "liq_pull" : "lp_mint",
      ref: `${pull ? "burn" : "mint"}:${ev.id}`,
      value: usd,
      meta: {
        pool: ev.address,
        usd: Number(usd.toFixed(0)),
        event: ev.eventName,
      },
    });
  }
  return signals;
}
