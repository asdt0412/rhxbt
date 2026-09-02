import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterMentions, isOnTopic, isQuestion, keepMention } from "./filter.js";
import { FIXTURE_MENTIONS } from "./harness.js";

describe("filter", () => {
  it("detects questions", () => {
    assert.equal(isQuestion("what is nvda?"), true);
    assert.equal(isQuestion("how does the bridge work"), true);
    assert.equal(isQuestion("prix tsla"), true);
    assert.equal(isQuestion("gm frens"), false);
  });

  it("detects on-topic text", () => {
    assert.equal(isOnTopic("nvda token on robinhood"), true);
    assert.equal(isOnTopic("$tsla pool liquidity"), true);
    assert.equal(isOnTopic("usdg on chain"), true);
    assert.equal(isOnTopic("bitcoin etf gossip"), false);
  });

  it("drops injection, gm, self, low followers", () => {
    const kept = filterMentions(FIXTURE_MENTIONS, "self").map((m) => m.tweetId);
    assert.deepEqual(kept.sort(), ["fix-inject-q", "fix-q-nvda"].sort());
    assert.equal(keepMention(FIXTURE_MENTIONS.find((m) => m.tweetId === "fix-inject")!, "self"), false);
  });
});
