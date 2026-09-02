import type { Signal } from "../types.js";

export function scoreSignal(s: Signal): number {
  const abs = Math.abs(s.value);
  switch (s.beat) {
    case "stockTokens":
      return (s.meta.marketClosed === true ? 12 : 6) + abs + (s.type === "stock_basis" ? 3 : 0);
    case "launches":
      return 8 + Math.log10(Math.max(abs, 1));
    case "liquidity":
      return (s.type === "honeypot" ? 11 : 7) + Math.log10(Math.max(abs, 1));
    case "whales":
      return 7 + Math.log10(Math.max(abs, 1));
    case "bridge":
      return 6 + Math.log10(Math.max(abs, 1));
    case "protocols":
      return 5 + Math.min(abs / 10_000, 4);
    case "narrative":
      return 5;
    case "vitals":
      return s.type === "recap" ? 20 : 3;
    default:
      return abs;
  }
}

export function rankSignals(signals: Signal[]): Signal[] {
  return signals
    .map((s) => ({ ...s, score: s.score ?? scoreSignal(s) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
