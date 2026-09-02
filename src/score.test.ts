import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickTopMention, rankMentions, scoreMention } from "./score.js";
import type { Mention } from "./types.js";

const base = (over: Partial<Mention>): Mention => ({
  tweetId: "t",
  authorId: "a",
  authorFollowers: 99,
  likes: 0,
  text: "what is nvda price?",
  thread: [],
  threadDepth: 1,
  ...over,
});

describe("score", () => {
  it("ranks higher followers and likes first", () => {
    const ranked = rankMentions([
      base({ tweetId: "low", authorFollowers: 50, likes: 0 }),
      base({ tweetId: "high", authorFollowers: 10_000, likes: 20 }),
    ]);
    assert.equal(ranked[0]?.tweetId, "high");
    assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
  });

  it("adds question bonus", () => {
    const q = scoreMention(base({ text: "what is tsla?" }));
    const nq = scoreMention(base({ text: "tsla token on robinhood chain looking active" }));
    assert.ok(q.score > nq.score);
  });

  it("picks exactly one top mention or none", () => {
    assert.equal(pickTopMention([]), null);
    const top = pickTopMention([
      base({ tweetId: "low", authorFollowers: 50 }),
      base({ tweetId: "high", authorFollowers: 10_000 }),
    ]);
    assert.equal(top?.tweetId, "high");
  });
});
