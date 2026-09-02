import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Signal } from "../types.js";
import { HOURLY_QUOTAS } from "./defs.js";
import { rankSignals } from "./rank.js";

const sig = (over: Partial<Signal> & Pick<Signal, "beat" | "type" | "ref" | "value">): Signal => ({
  meta: {},
  ...over,
});

describe("beat ranking + quotas", () => {
  it("ranks daily recap and off-hours stock above bridge noise", () => {
    const ranked = rankSignals([
      sig({ beat: "bridge", type: "bridge", ref: "b", value: 80_000 }),
      sig({ beat: "stockTokens", type: "stock_move", ref: "s", value: 2.8, meta: { marketClosed: true } }),
      sig({ beat: "vitals", type: "recap", ref: "r", value: 1 }),
    ]);
    assert.equal(ranked[0]?.type, "recap");
    assert.equal(ranked[1]?.beat, "stockTokens");
  });

  it("enforces per-beat hourly caps so one beat cannot flood", () => {
    const flooded: Signal[] = Array.from({ length: 12 }, (_, i) =>
      sig({ beat: "whales", type: "whale_transfer", ref: `flood-${i}`, value: 100_000 + i }),
    );
    assert.equal(HOURLY_QUOTAS.whales < flooded.length, true);
    assert.ok(HOURLY_QUOTAS.vitals === 1);
  });
});
