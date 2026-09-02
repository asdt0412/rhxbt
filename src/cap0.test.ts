import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { budgetAllows } from "./budget.js";
import { createMemoryStore } from "./db.js";
import { filterMentions } from "./filter.js";
import { FIXTURE_MENTIONS } from "./harness.js";

describe("cap 0 never replies", () => {
  it("filter can produce a queue but budget 0 forbids every write", async () => {
    const kept = filterMentions(FIXTURE_MENTIONS, "self");
    assert.ok(kept.length > 0);
    const store = createMemoryStore();
    const used = await store.countReplies("15min");
    assert.equal(
      budgetAllows({
        per15min: { used, cap: 0 },
        perDay: { used, cap: 100 },
        perMonth: { used, cap: 1500 },
      }),
      false,
    );
  });
});
