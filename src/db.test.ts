import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStore } from "./db.js";

describe("memory store dedupe", () => {
  it("never marks the same signal or tweet twice", async () => {
    const s = createMemoryStore();
    assert.equal(await s.markSeen("stock_move", "nvda:1"), true);
    assert.equal(await s.markSeen("stock_move", "nvda:1"), false);
    assert.equal(await s.isSeen("stock_move", "nvda:1"), true);

    assert.equal(await s.markPosted("nvda:1", "tw1", "nvda +2%"), true);
    assert.equal(await s.markPosted("nvda:1", "tw2", "nvda +2%"), false);

    assert.equal(await s.markReplied("t1", "a1"), true);
    assert.equal(await s.markReplied("t1", "a1"), false);
    assert.equal(await s.hasReplied("t1"), true);
    assert.equal(await s.countReplies("15min"), 1);

    await s.recordBeatPost("whales", "w1", "2026-09-03T00");
    await s.recordBeatPost("whales", "w2", "2026-09-03T00");
    assert.equal(await s.countBeatPosts("whales", "2026-09-03T00"), 2);
    assert.equal(await s.countBeatPosts("whales", "2026-09-03T01"), 0);
  });
});
