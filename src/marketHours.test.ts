import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { etParts, isUsMarketClosed, isUsMarketHoliday } from "./marketHours.js";

describe("marketHours", () => {
  it("treats saturday as closed", () => {
    const sat = new Date("2026-09-05T16:00:00Z");
    assert.equal(etParts(sat).weekday, 6);
    assert.equal(isUsMarketClosed(sat), true);
  });

  it("treats a weekday 15:00 ET as open", () => {
    const wed = new Date("2026-09-02T19:00:00Z");
    assert.equal(isUsMarketHoliday(wed), false);
    assert.equal(isUsMarketClosed(wed), false);
  });

  it("treats thanksgiving 2026 as a holiday", () => {
    const tg = new Date("2026-11-26T16:00:00Z");
    assert.equal(isUsMarketHoliday(tg), true);
    assert.equal(isUsMarketClosed(tg), true);
  });
});
