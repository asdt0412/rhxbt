import { TwitterApi, type TweetV2, type TwitterRateLimit, type UserV2 } from "twitter-api-v2";
import { config, flags, hasXCredentials } from "./config.js";
import { log } from "./logger.js";
import { noteRateLimit, withXRateLimit, type XLane } from "./ratelimit.js";

let client: TwitterApi | null = null;

export function getX(): TwitterApi | null {
  if (!hasXCredentials()) return null;
  if (!client) {
    client = new TwitterApi({
      appKey: config.xApiKey,
      appSecret: config.xApiSecret,
      accessToken: config.xAccessToken,
      accessSecret: config.xAccessSecret,
    });
  }
  return client;
}

function captureLimit(
  rateLimit: TwitterRateLimit | { remaining?: number; reset?: number; limit?: number } | undefined,
  lane: XLane,
): void {
  if (!rateLimit) return;
  noteRateLimit(
    {
      remaining: rateLimit.remaining,
      reset: rateLimit.reset,
      limit: rateLimit.limit,
    },
    lane,
  );
}

function captureFromClient(x: TwitterApi, lane: XLane, endpointMatch?: string): void {
  const maker = (x as unknown as { _requestMaker?: { rateLimits?: Record<string, TwitterRateLimit> } })
    ._requestMaker;
  const limits = maker?.rateLimits ?? {};
  let remaining: number | undefined;
  let reset: number | undefined;
  for (const [key, v] of Object.entries(limits)) {
    if (endpointMatch && !key.toLowerCase().includes(endpointMatch.toLowerCase())) continue;
    if (typeof v.remaining !== "number") continue;
    if (remaining === undefined || v.remaining < remaining) {
      remaining = v.remaining;
      reset = v.reset;
    }
  }
  if (remaining !== undefined) noteRateLimit({ remaining, reset }, lane);
}

export async function postTweet(text: string, inReplyTo?: string): Promise<string | null> {
  if (flags.dryRun) {
    log.info("DRY-RUN x write blocked", { text, inReplyTo });
    return null;
  }
  const x = getX();
  if (!x) {
    log.warn("x client missing — cannot post");
    return null;
  }
  const lane: XLane = inReplyTo ? "reply" : "news";
  const result = await withXRateLimit(async () => {
    const payload = inReplyTo ? { text, reply: { in_reply_to_tweet_id: inReplyTo } } : { text };
    const res = await x.v2.tweet(payload);
    const rl = (res as { rateLimit?: TwitterRateLimit }).rateLimit;
    if (rl) captureLimit(rl, lane);
    else captureFromClient(x, lane, "tweets");
    return res.data.id;
  }, lane);
  return result;
}

export async function replyToTweet(tweetId: string, text: string): Promise<string | null> {
  return postTweet(text, tweetId);
}

export type MentionPage = {
  tweets: TweetV2[];
  users: Map<string, UserV2>;
  includesTweets: Map<string, TweetV2>;
  newestId?: string;
};

export async function fetchMentions(sinceId?: string): Promise<MentionPage | null> {
  const x = getX();
  if (!x || !config.xUserId) return null;

  return withXRateLimit(async () => {
    const res = await x.v2.userMentionTimeline(config.xUserId, {
      since_id: sinceId,
      max_results: 100,
      expansions: ["author_id", "referenced_tweets.id", "in_reply_to_user_id"],
      "tweet.fields": [
        "author_id",
        "conversation_id",
        "created_at",
        "in_reply_to_user_id",
        "public_metrics",
        "referenced_tweets",
        "text",
      ],
      "user.fields": ["public_metrics", "username"],
    });
    captureLimit(res.rateLimit, "reply");
    const users = new Map<string, UserV2>();
    for (const u of res.includes.users ?? []) users.set(u.id, u);
    const includesTweets = new Map<string, TweetV2>();
    for (const t of res.includes.tweets ?? []) includesTweets.set(t.id, t);
    return {
      tweets: res.tweets ?? res.data.data ?? [],
      users,
      includesTweets,
      newestId: res.meta.newest_id,
    };
  }, "reply");
}

export async function fetchTweetsByIds(ids: string[]): Promise<Map<string, TweetV2>> {
  const out = new Map<string, TweetV2>();
  const x = getX();
  if (!x || ids.length === 0) return out;
  const unique = [...new Set(ids)].slice(0, 100);
  const page = await withXRateLimit(async () => {
    const res = await x.v2.tweets(unique, {
      "tweet.fields": ["author_id", "conversation_id", "text", "referenced_tweets", "public_metrics"],
    });
    captureFromClient(x, "reply", "tweets");
    return res.data ?? [];
  }, "reply");
  for (const t of page ?? []) out.set(t.id, t);
  return out;
}

const NARRATIVE_QUERY =
  'from:RobinhoodApp (chain OR "stock token" OR tokenized OR listing OR partnership OR earn OR usdg OR uniswap OR morpho OR lighter)';

export async function searchNarrativeTweets(): Promise<TweetV2[] | null> {
  const x = getX();
  if (!x) return null;
  return withXRateLimit(async () => {
    const res = await x.v2.search(NARRATIVE_QUERY, {
      max_results: 20,
      "tweet.fields": ["created_at", "public_metrics", "text", "author_id"],
    });
    captureLimit(res.rateLimit, "news");
    return res.tweets ?? res.data.data ?? [];
  }, "news");
}
