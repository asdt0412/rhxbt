import { log } from "../logger.js";
import type { Signal } from "../types.js";
import { searchNarrativeTweets } from "../x.js";

const KEYWORDS = [
  "stock token",
  "tokenized",
  "listing",
  "listed",
  "partnership",
  "robinhood chain",
  "earn",
  "usdg",
];

export async function collectNarrative(): Promise<Signal[]> {
  const tweets = await searchNarrativeTweets();
  if (!tweets) {
    log.info("narrative: no x search");
    return [];
  }
  const signals: Signal[] = [];
  for (const t of tweets) {
    const text = t.text.toLowerCase();
    const hit = KEYWORDS.some((k) => text.includes(k));
    if (!hit) continue;
    signals.push({
      beat: "narrative",
      type: "narrative",
      ref: `narr:${t.id}`,
      value: t.public_metrics?.like_count ?? 0,
      meta: {
        tweetId: t.id,
        text: t.text.slice(0, 240),
        likes: t.public_metrics?.like_count ?? 0,
        createdAt: t.created_at,
      },
    });
  }
  return signals;
}
