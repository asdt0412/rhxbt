/** US cash equity session: NYSE/Nasdaq 09:30–16:00 America/New_York, weekdays, minus holidays. */

const ET = "America/New_York";

export type EtParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

export function etParts(at: Date = new Date()): EtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "0";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWd = first.getUTCDay();
  const offset = (weekday - firstWd + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

function lastWeekday(year: number, month: number, weekday: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  const lastDate = last.getUTCDate();
  const lastWd = last.getUTCDay();
  const delta = (lastWd - weekday + 7) % 7;
  return lastDate - delta;
}

/** Observed US equity-market holidays (NYSE/Nasdaq), including weekend observances. */
export function usMarketHolidays(year: number): Set<string> {
  const dates = new Set<string>();
  const add = (m: number, d: number) =>
    dates.add(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

  const observe = (m: number, d: number) => {
    const dt = new Date(Date.UTC(year, m - 1, d));
    const wd = dt.getUTCDay();
    if (wd === 6) {
      const prev = new Date(Date.UTC(year, m - 1, d - 1));
      add(prev.getUTCMonth() + 1, prev.getUTCDate());
    } else if (wd === 0) {
      const next = new Date(Date.UTC(year, m - 1, d + 1));
      add(next.getUTCMonth() + 1, next.getUTCDate());
    } else {
      add(m, d);
    }
  };

  observe(1, 1);
  add(1, nthWeekday(year, 1, 1, 3));
  add(2, nthWeekday(year, 2, 1, 3));
  add(5, lastWeekday(year, 5, 1));
  observe(6, 19);
  observe(7, 4);
  add(9, nthWeekday(year, 9, 1, 1));
  add(11, nthWeekday(year, 11, 4, 4));
  observe(12, 25);

  const easter = easterSunday(year);
  const friday = new Date(easter);
  friday.setUTCDate(easter.getUTCDate() - 2);
  add(friday.getUTCMonth() + 1, friday.getUTCDate());

  return dates;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function isUsMarketHoliday(at: Date = new Date()): boolean {
  const p = etParts(at);
  const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return usMarketHolidays(p.year).has(key);
}

export function isUsMarketClosed(at: Date = new Date()): boolean {
  const p = etParts(at);
  if (p.weekday === 0 || p.weekday === 6) return true;
  if (isUsMarketHoliday(at)) return true;
  const minutes = p.hour * 60 + p.minute;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutes < open || minutes >= close;
}

export function marketSessionLabel(at: Date = new Date()): "open" | "closed" {
  return isUsMarketClosed(at) ? "closed" : "open";
}
