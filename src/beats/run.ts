import { log } from "../logger.js";
import type { Signal } from "../types.js";
import { collectBridge } from "./bridge.js";
import { collectLaunches } from "./launches.js";
import { collectLiquidity } from "./liquidity.js";
import { collectNarrative } from "./narrative.js";
import { collectProtocols } from "./protocols.js";
import { applyHourlyQuotas } from "./quotas.js";
import { rankSignals } from "./rank.js";
import { collectStockTokens } from "./stockTokens.js";
import { collectVitals } from "./vitals.js";
import { collectWhales } from "./whales.js";

export async function collectAllBeats(): Promise<Signal[]> {
  const chunks = await Promise.allSettled([
    collectLaunches(),
    collectLiquidity(),
    collectStockTokens(),
    collectWhales(),
    collectBridge(),
    collectProtocols(),
    collectVitals(),
    collectNarrative(),
  ]);
  const signals: Signal[] = [];
  for (const c of chunks) {
    if (c.status === "fulfilled") signals.push(...c.value);
    else log.warn("beat failed", { err: String(c.reason) });
  }
  log.info("beats collected", {
    n: signals.length,
    byBeat: signals.reduce<Record<string, number>>((acc, s) => {
      acc[s.beat] = (acc[s.beat] ?? 0) + 1;
      return acc;
    }, {}),
  });
  return signals;
}

export async function selectSignals(signals: Signal[]): Promise<Signal[]> {
  return applyHourlyQuotas(rankSignals(signals));
}
