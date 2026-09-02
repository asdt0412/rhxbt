import { analyze } from "./analyzer.js";
import { canReply } from "./budget.js";
import { collectBridge } from "./collectors/bridge.js";
import { collectMentions, ownUserId } from "./collectors/mentions.js";
import { collectNewPools } from "./collectors/newPools.js";
import { collectStockTokens } from "./collectors/stockTokens.js";
import { config, flags } from "./config.js";
import { getStore } from "./db.js";
import { filterMentions } from "./filter.js";
import { log } from "./logger.js";
import { publish } from "./publisher.js";
import { rateLimitOk } from "./ratelimit.js";
import { respond } from "./responder.js";
import { isSafeOutput } from "./safety.js";
import { rankMentions } from "./score.js";
import type { Mention, Signal } from "./types.js";
import { replyToTweet } from "./x.js";

let postingLock = false;
let replyLock = false;

export async function ingestSignals(signals: Signal[]): Promise<void> {
  const store = getStore();
  const fresh: Signal[] = [];
  for (const s of signals) {
    if (await store.isPosted(s.ref)) continue;
    const first = await store.markSeen(s.type, s.ref);
    if (!first) continue;
    fresh.push(s);
  }
  if (fresh.length === 0) return;

  const ordered = [...fresh].sort((a, b) => {
    const ae = a.type === "stock_move" && a.meta.marketClosed === true ? 1 : 0;
    const be = b.type === "stock_move" && b.meta.marketClosed === true ? 1 : 0;
    if (ae !== be) return be - ae;
    return Math.abs(b.value) - Math.abs(a.value);
  });

  let posted = 0;
  for (const signal of ordered) {
    if (posted >= config.maxPostsPerCycle) break;
    const result = await analyze([signal]);
    if (!result.post) {
      log.info("analyzer dropped signal", { ref: signal.ref });
      continue;
    }
    const id = await publish(signal, result.post);
    if (id) posted += 1;
  }
}

export async function runPostingPipeline(): Promise<void> {
  if (postingLock) {
    log.debug("posting cycle skipped — already running");
    return;
  }
  postingLock = true;
  try {
    const chunks = await Promise.allSettled([
      collectStockTokens(),
      collectNewPools(),
      collectBridge(),
    ]);
    const signals: Signal[] = [];
    for (const c of chunks) {
      if (c.status === "fulfilled") signals.push(...c.value);
      else log.warn("collector failed", { err: String(c.reason) });
    }
    log.info("posting cycle collected", { n: signals.length, types: signals.map((s) => s.type) });
    await ingestSignals(signals);
  } finally {
    postingLock = false;
  }
}

export async function runReplyPipeline(mentionsOverride?: Mention[]): Promise<number> {
  if (replyLock) {
    log.debug("reply cycle skipped — already running");
    return 0;
  }
  replyLock = true;
  let replied = 0;
  try {
    const raw = mentionsOverride ?? (await collectMentions());
    const own = ownUserId();
    const filtered = filterMentions(raw, own);
    const ranked = rankMentions(filtered);
    log.info("reply queue", { raw: raw.length, kept: ranked.length });

    for (const m of ranked) {
      if (!(await canReply())) break;
      if (!rateLimitOk()) {
        log.warn("x rate limit not ok — stopping reply cycle");
        break;
      }
      const store = getStore();
      if (await store.hasReplied(m.tweetId)) continue;

      const result = await respond(m);
      if (!result.reply) {
        await store.markReplied(m.tweetId, m.authorId);
        log.info("no reply warranted", { tweetId: m.tweetId });
        continue;
      }

      const body = result.reply.trim().toLowerCase().slice(0, 280);
      if (!isSafeOutput(body)) {
        await store.markReplied(m.tweetId, m.authorId);
        log.warn("reply blocked by safety filter", { tweetId: m.tweetId, text: body });
        continue;
      }
      if (flags.dryRun) {
        log.info("DRY-RUN reply", { tweetId: m.tweetId, text: body });
        await store.markReplied(m.tweetId, m.authorId);
        replied += 1;
        continue;
      }

      const id = await replyToTweet(m.tweetId, body);
      if (!id) {
        log.warn("reply write failed — not marking (will retry)", { tweetId: m.tweetId });
        break;
      }
      await store.markReplied(m.tweetId, m.authorId);
      replied += 1;
    }
  } finally {
    replyLock = false;
  }
  return replied;
}
