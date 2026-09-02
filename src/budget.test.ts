import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { budgetAllows, type BudgetSnapshot } from "./budget.js";

const snap = (over: Partial<BudgetSnapshot> = {}): BudgetSnapshot => ({
  per15min: { used: 0, cap: 10 },
  perDay: { used: 0, cap: 100 },
  perMonth: { used: 0, cap: 1500 },
  ...over,
});

describe("budget", () => {
  it("allows when all windows are under cap", () => {
    assert.equal(budgetAllows(snap()), true);
  });

  it("blocks when any cap is 0", () => {
    assert.equal(
      budgetAllows({
        per15min: { used: 0, cap: 0 },
        perDay: { used: 0, cap: 100 },
        perMonth: { used: 0, cap: 1500 },
      }),
      false,
    );
  });

  it("blocks when a window is exhausted", () => {
    assert.equal(budgetAllows(snap({ perDay: { used: 100, cap: 100 } })), false);
  });
});
