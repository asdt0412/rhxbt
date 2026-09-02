import Anthropic from "@anthropic-ai/sdk";
import { config, flags, hasAnthropic } from "./config.js";
import { asPostResult, extractJson } from "./json.js";
import { log } from "./logger.js";
import { POSTING_SYSTEM_PROMPT } from "./prompts.js";
import type { AnalyzeResult, Signal } from "./types.js";

function localAnalyze(signals: Signal[]): AnalyzeResult {
  const kept = signals.filter((s) => {
    if (s.type === "stock_move") {
      return Math.abs(s.value) >= 1.5 && (s.meta.marketClosed === true || Math.abs(s.value) >= 3);
    }
    if (s.type === "new_pool") {
      const liq = Number(s.meta.liquidityUsd ?? s.value);
      const vol = Number(s.meta.volume24hUsd ?? 0);
      return liq >= 5000 && vol > 0;
    }
    if (s.type === "bridge") return Math.abs(s.value) >= 50_000;
    return false;
  });
  const best = kept[0];
  if (!best) return { post: null };

  if (best.type === "stock_move") {
    const pct = Number(best.meta.changePct ?? best.value);
    const sign = pct >= 0 ? "+" : "";
    const ticker = (best.ticker ?? "?").toLowerCase();
    const since = best.meta.marketClosed ? "since nyse close" : "on-session";
    return { post: `${ticker} token ${sign}${pct.toFixed(1)}% ${since}. ${Number(best.meta.price).toFixed(2)} usd. rh chain` };
  }
  if (best.type === "new_pool") {
    return {
      post: `new pool ${String(best.meta.pair ?? best.ticker).toLowerCase()} liq $${Math.round(Number(best.meta.liquidityUsd))} vol24h $${Math.round(Number(best.meta.volume24hUsd))}. rh chain`,
    };
  }
  const dir = best.value >= 0 ? "inflow" : "outflow";
  return {
    post: `bridge ${dir} $${Math.round(Math.abs(best.value)).toLocaleString("en-US")} last hour. rh chain`,
  };
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
  const user = JSON.stringify(signals, null, 2);

  try {
    const msg = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 400,
      temperature: 0.4,
      system: POSTING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `signals (json array). return strict json only.\n${user}`,
        },
      ],
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
