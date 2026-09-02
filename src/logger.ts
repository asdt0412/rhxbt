type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function nowIso(): string {
  return new Date().toISOString();
}

function emit(level: Level, msg: string, extra?: Record<string, unknown>): void {
  const min = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  if (LEVEL_RANK[level] < LEVEL_RANK[min] && min in LEVEL_RANK) return;
  const line = extra
    ? `${nowIso()} [${level}] ${msg} ${JSON.stringify(extra)}`
    : `${nowIso()} [${level}] ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit("error", msg, extra),
};
