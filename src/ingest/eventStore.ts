import { and, eq, gte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "../db.js";
import { rawEvents, schema } from "../schema.js";
import type { RawEvent } from "../types.js";

const memory = new Map<string, RawEvent>();

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function insertRawEvents(events: RawEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const pool = getPool();
  if (!pool) {
    let n = 0;
    for (const e of events) {
      if (memory.has(e.id)) continue;
      memory.set(e.id, e);
      n += 1;
    }
    return n;
  }
  const db = drizzle(pool, { schema });
  const rows = events.map((e) => ({
    id: e.id,
    eventName: e.eventName,
    address: e.address.toLowerCase(),
    txHash: e.txHash,
    blockNumber: e.blockNumber,
    logIndex: e.logIndex,
    timestamp: e.timestamp ? new Date(e.timestamp * 1000) : null,
    args: JSON.stringify(e.args),
  }));
  const inserted = await db.insert(rawEvents).values(rows).onConflictDoNothing().returning({ id: rawEvents.id });
  return inserted.length;
}

export async function queryRawEvents(opts: {
  names?: string[];
  address?: string;
  fromBlock?: number;
  limit?: number;
}): Promise<RawEvent[]> {
  const pool = getPool();
  if (!pool) {
    let rows = [...memory.values()];
    if (opts.names?.length) rows = rows.filter((e) => opts.names!.includes(e.eventName));
    if (opts.address) rows = rows.filter((e) => e.address.toLowerCase() === opts.address!.toLowerCase());
    if (opts.fromBlock !== undefined) rows = rows.filter((e) => e.blockNumber >= opts.fromBlock!);
    rows.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
    return rows.slice(0, opts.limit ?? 500);
  }

  const db = drizzle(pool, { schema });
  const filters = [];
  if (opts.names?.length) filters.push(inArray(rawEvents.eventName, opts.names));
  if (opts.address) filters.push(eq(rawEvents.address, opts.address.toLowerCase()));
  if (opts.fromBlock !== undefined) filters.push(gte(rawEvents.blockNumber, opts.fromBlock));
  const rows = await db
    .select()
    .from(rawEvents)
    .where(filters.length ? and(...filters) : undefined)
    .limit(opts.limit ?? 500);
  return rows.map((r) => ({
    id: r.id,
    eventName: r.eventName,
    address: r.address,
    txHash: r.txHash,
    blockNumber: r.blockNumber,
    logIndex: r.logIndex,
    timestamp: r.timestamp ? Math.floor(r.timestamp.getTime() / 1000) : null,
    args: parseArgs(r.args),
  }));
}

export function seedMemoryEvents(events: RawEvent[]): void {
  for (const e of events) memory.set(e.id, e);
}

export function clearMemoryEvents(): void {
  memory.clear();
}
