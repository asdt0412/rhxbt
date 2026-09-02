import { flags } from "./config.js";
import { getStore } from "./db.js";
import { log } from "./logger.js";
import { isSafeOutput } from "./safety.js";
import type { Signal } from "./types.js";
import { postTweet } from "./x.js";

export async function publish(signal: Signal, text: string): Promise<string | null> {
  const store = getStore();
  if (await store.isPosted(signal.ref)) {
    log.info("skip already posted", { ref: signal.ref });
    return null;
  }

  const body = text.trim().toLowerCase().slice(0, 280);
  if (!body || !isSafeOutput(body)) {
    log.warn("publish blocked by safety filter", { ref: signal.ref, text: body });
    return null;
  }

  if (flags.dryRun) {
    log.info("DRY-RUN post", { ref: signal.ref, beat: signal.beat, type: signal.type, text: body });
    await store.markPosted(signal.ref, `dryrun-${Date.now()}`, body);
    return `dryrun-${signal.ref}`;
  }

  const tweetId = await postTweet(body);
  if (!tweetId) {
    log.warn("publish skipped — x write failed", { ref: signal.ref });
    return null;
  }
  await store.markPosted(signal.ref, tweetId, body);
  log.info("posted", { ref: signal.ref, tweetId });
  return tweetId;
}
