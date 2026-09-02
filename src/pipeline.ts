import { analyze } from "./analyzer.js";
import { collectAllBeats, selectSignals } from "./beats/run.js";
import { noteBeatPost } from "./beats/quotas.js";
import { buildDailyRecap, markRecapPosted } from "./beats/vitals.js";
import { canReply } from "./budget.js";
import { collectMentions, ownUserId } from "./collectors/mentions.js";
import { flags } from "./config.js";
import { getStore } from "./db.js";
import { filterMentions } from "./filter.js";
import { runIngest } from "./ingest/hypersyncIngest.js";
import { log } from "./logger.js";
import { etDateKey } from "./beats/defs.js";
import { publish } from "./publisher.js";
import { rateLimitOk } from "./ratelimit.js";
import { respond } from "./responder.js";
import { isSafeOutput } from "./safety.js";
import { pickTopMention } from "./score.js";
import type { Mention, Signal } from "./types.js";
import { replyToTweet } from "./x.js";

/** Look tick lock — independent from replyLock. The two loops never await each other. */
let lookLock = false;
let replyLock = false;

/**
 * One look: ingest already happened; decide whether anything merits a post.
 * Quotas are anti-spam ceilings only — never a reason to post.
 * Most calls return without publishing ({post: null} or no fresh signals).
 */
export async function ingestSignals(signals: Signal[]): Promise<void> {
  const store = getStore();
  const fresh: Signal[] = [];
  for (const s of signals) {
    if (await store.isPosted(s.ref)) continue;
    const first = await store.markSeen(s.beat, s.ref);
    if (!first) continue;
    fresh.push(s);
  }
  if (fresh.length === 0) {
    log.info("look tick — no new signals");
    return;
  }

  const selected = await selectSignals(fresh);
  if (selected.length === 0) {
    log.info("look tick — all candidate beats at hourly ceiling");
    return;
  }

  const result = await analyze(selected);
  if (!result.post) {
    log.info("look tick — analyzer chose not to post", { n: selected.length });
    return;
  }

  const signal = selected[0];
  if (!signal) return;
  const id = await publish(signal, result.post);
  if (id) await noteBeatPost(signal);
}

/** Cron only controls how often we LOOK. Whether we post is the analyzer's call. */
export async function runLookTick(): Promise<void> {
  if (lookLock) {
    log.debug("look tick skipped — already running");
    return;
  }
  lookLock = true;
  try {
    try {
      await runIngest();
    } catch (err) {
      log.warn("ingest failed — beats will use existing raw_events", { err: String(err) });
    }
    const signals = await collectAllBeats();
    await ingestSignals(signals);
  } finally {
    lookLock = false;
  }
}

/** @deprecated alias — look tick, not a posting schedule */
export const runPostingPipeline = runLookTick;

export async function runDailyRecap(now = new Date()): Promise<void> {
  const recap = await buildDailyRecap(now);
  if (!recap) {
    log.info("daily recap already posted or empty");
    return;
  }
  await ingestSignals([recap]);
  if (await getStore().isPosted(recap.ref)) await markRecapPosted(etDateKey(now));
}

export async function runReplyPipeline(mentionsOverride?: Mention[]): Promise<number> {
  if (replyLock) {
    log.debug("reply cycle skipped — already running");
    return 0;
  }
  replyLock = true;
  try {
    const raw = mentionsOverride ?? (await collectMentions());
    const own = ownUserId();
    const filtered = filterMentions(raw, own);
    const top = pickTopMention(filtered);

    if (!top) {
      log.info("reply tick skipped — no candidate passed filter", { raw: raw.length });
      return 0;
    }

    // TODO: persist leftover filtered mentions in a queue with 2h expiry
    // when volume grows. For now fire-and-forget: only the top score is kept.
    if (filtered.length > 1) {
      log.info("reply tick dropped extras", {
        kept: top.tweetId,
        dropped: filtered.length - 1,
      });
    }

    const store = getStore();
    if (await store.hasReplied(top.tweetId)) {
      log.info("reply tick skipped — top candidate already replied", { tweetId: top.tweetId });
      return 0;
    }
    if (!(await canReply())) return 0;
    if (!rateLimitOk("reply")) {
      log.warn("reply tick skipped — x reply-lane rate limit backstop");
      return 0;
    }

    const result = await respond(top);
    if (!result.reply) {
      await store.markReplied(top.tweetId, top.authorId);
      log.info("no reply warranted", { tweetId: top.tweetId });
      return 0;
    }

    const body = result.reply.trim().toLowerCase().slice(0, 280);
    if (!isSafeOutput(body)) {
      await store.markReplied(top.tweetId, top.authorId);
      log.warn("reply blocked by safety filter", { tweetId: top.tweetId, text: body });
      return 0;
    }

    if (flags.dryRun) {
      log.info("DRY-RUN reply", { tweetId: top.tweetId, text: body });
      await store.markReplied(top.tweetId, top.authorId);
      return 1;
    }

    const id = await replyToTweet(top.tweetId, body);
    if (!id) {
      log.warn("reply write failed — not marking (will retry next eligible tick)", {
        tweetId: top.tweetId,
      });
      return 0;
    }
    await store.markReplied(top.tweetId, top.authorId);
    return 1;
  } finally {
    replyLock = false;
  }
}
