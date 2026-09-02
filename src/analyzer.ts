import Anthropic from "@anthropic-ai/sdk";
import { config, flags, hasAnthropic } from "./config.js";
import { asPostResult, extractJson } from "./json.js";
import { log } from "./logger.js";
import { POSTING_SYSTEM_PROMPT } from "./prompts.js";
import type { AnalyzeResult, Signal } from "./types.js";

function localAnalyze(signals: Signal[]): AnalyzeResult {
  const best = signals[0];
  if (!best) return { post: null };

  if (best.type === "recap") {
    const tx = best.meta.txCount ?? "?";
    const movers = Array.isArray(best.meta.topMovers)
      ? (best.meta.topMovers as Array<{ ticker: string; price: number }>)
          .slice(0, 3)
          .map((m) => `${m.ticker.toLowerCase()} ${m.price.toFixed(0)}`)
          .join(", ")
      : "";
    return { post: `rh chain daily: ${tx} tx. ${movers}. gas ~100ms blocks.` };
  }
  if (best.type === "stock_move") {
    const pct = Number(best.meta.changePct ?? best.value);
    const sign = pct >= 0 ? "+" : "";
    const ticker = (best.ticker ?? "?").toLowerCase();
    const since = best.meta.marketClosed ? "since nyse close" : "on-session";
    return { post: `${ticker} token ${sign}${pct.toFixed(1)}% ${since}. ${Number(best.meta.price).toFixed(2)} usd. rh chain` };
  }
  if (best.type === "stock_basis") {
    const ticker = (best.ticker ?? "?").toLowerCase();
    const basis = Number(best.meta.basisPct ?? best.value);
    const side = basis >= 0 ? "premium" : "discount";
    return {
      post: `${ticker} token ${Math.abs(basis).toFixed(1)}% ${side} vs cash equity (${Number(best.meta.onchain).toFixed(2)} vs ${Number(best.meta.equity).toFixed(2)}). rh chain`,
    };
  }
  if (best.beat === "launches") {
    return {
      post: `${best.type.replace("_", " ")} ${String(best.meta.pair ?? best.ticker).toLowerCase()} liq $${Math.round(Number(best.meta.liquidityUsd ?? best.value))} vol24h $${Math.round(Number(best.meta.volume24hUsd ?? 0))}. rh chain`,
    };
  }
  if (best.type === "honeypot") {
    return { post: `pool ${String(best.meta.pair ?? best.ticker).toLowerCase()} sell-sim failed or unverified. rh chain` };
  }
  if (best.beat === "liquidity") {
    return { post: `lp ${best.type} ~$${Math.round(best.value)} on ${String(best.meta.pool).slice(0, 10)}. rh chain` };
  }
  if (best.type === "whale_transfer") {
    return {
      post: `whale ${String(best.ticker).toLowerCase()} $${Math.round(Number(best.meta.usd ?? best.value)).toLocaleString("en-US")}. rh chain`,
    };
  }
  if (best.beat === "bridge") {
    const dir = best.value >= 0 ? "inflow" : "outflow";
    return { post: `${best.type === "usdg_supply" ? "usdg" : "bridge"} ${dir} $${Math.round(Math.abs(best.value)).toLocaleString("en-US")}. rh chain` };
  }
  if (best.type === "narrative") {
    return { post: `robinhood: ${String(best.meta.text ?? "").slice(0, 200)}` };
  }
  if (best.type === "verified_contract") {
    return { post: `new verified contract ${String(best.meta.name ?? "").toLowerCase() || String(best.meta.address).slice(0, 10)}. rh chain` };
  }
  return { post: null };
}

export async function analyze(signals: Signal[]): Promise<AnalyzeResult> {
  if (signals.length === 0) return { post: null };

  if (!hasAnthropic()) {
    if (flags.dryRun) {
      log.warn("no ANTHROPIC_API_KEY — local composer (dry-run)");
      return localAnalyze(signals);
    }
    throw new Error("ANTHROPIC_API_KEY required");
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const recap = signals.some((s) => s.type === "recap");
  const user = [
    recap
      ? "daily chain recap. cover volume/tvl/movers/launches if present. one post."
      : "look tick — not a posting schedule. most ticks should be {\"post\":null}. post only if on-chain activity merits it. hourly quotas are anti-spam ceilings, never a minimum. at most one post.",
    JSON.stringify(signals, null, 2),
  ].join("\n");

  try {
    const msg = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 400,
      temperature: 0.4,
      system: POSTING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return asPostResult(extractJson(text));
  } catch (err) {
    log.error("analyzer failed", { err: String(err) });
    if (flags.dryRun) return localAnalyze(signals);
    return { post: null };
  }
}
