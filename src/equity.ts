import { config } from "./config.js";
import { log } from "./logger.js";

export type EquityQuote = {
  ticker: string;
  price: number;
  previousClose?: number;
  source: "finnhub" | "polygon";
};

export async function equityQuote(ticker: string): Promise<EquityQuote | null> {
  const symbol = ticker.toUpperCase();
  if (config.finnhubApiKey) {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${config.finnhubApiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const json = (await res.json()) as { c?: number; pc?: number };
        if (json.c && json.c > 0) {
          return { ticker: symbol, price: json.c, previousClose: json.pc, source: "finnhub" };
        }
      }
    } catch (err) {
      log.warn("finnhub quote failed", { ticker: symbol, err: String(err) });
    }
  }
  if (config.polygonApiKey) {
    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev?adjusted=true&apiKey=${config.polygonApiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const json = (await res.json()) as { results?: Array<{ c?: number }> };
        const close = json.results?.[0]?.c;
        if (close && close > 0) return { ticker: symbol, price: close, previousClose: close, source: "polygon" };
      }
    } catch (err) {
      log.warn("polygon quote failed", { ticker: symbol, err: String(err) });
    }
  }
  return null;
}
