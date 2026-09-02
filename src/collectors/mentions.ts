import { config } from "../config.js";
import { getStore } from "../db.js";
import { log } from "../logger.js";
import type { Mention } from "../types.js";
import { fetchMentions } from "../x.js";

const SINCE_KEY = "mentions_since_id";
const MAX_THREAD = 3;

/** Polled every 10 minutes. Single X read; since_id advances so leftovers are dropped. */

export async function collectMentions(): Promise<Mention[]> {
  const store = getStore();
  const sinceId = (await store.getKv(SINCE_KEY)) ?? undefined;
  const page = await fetchMentions(sinceId);
  if (!page) {
    log.info("mentions: no x client");
    return [];
  }

  // One X read per 10-min tick: parent/thread context comes only from the
  // mentions response expansions. No follow-up tweet lookups.
  const mentions: Mention[] = [];
  for (const t of page.tweets) {
    const author = t.author_id ? page.users.get(t.author_id) : undefined;
    const thread: string[] = [];
    let depth = 1;
    let cursor = t.referenced_tweets?.find((r) => r.type === "replied_to")?.id;
    while (cursor && depth < MAX_THREAD) {
      const parent = page.includesTweets.get(cursor);
      if (!parent) break;
      thread.push(parent.text);
      depth += 1;
      cursor = parent.referenced_tweets?.find((r) => r.type === "replied_to")?.id;
    }
    const parentText = thread[0];
    mentions.push({
      tweetId: t.id,
      authorId: t.author_id ?? "",
      authorUsername: author?.username,
      authorFollowers: author?.public_metrics?.followers_count ?? 0,
      likes: t.public_metrics?.like_count ?? 0,
      text: t.text,
      conversationId: t.conversation_id,
      parentText,
      thread,
      threadDepth: depth,
      createdAt: t.created_at,
    });
  }

  if (page.newestId) await store.setKv(SINCE_KEY, page.newestId);
  log.info("mentions fetched", { n: mentions.length, sinceId, newest: page.newestId });
  return mentions;
}

export function ownUserId(): string {
  return config.xUserId || "self";
}
