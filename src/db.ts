import { and, count, eq, gte, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config, flags } from "./config.js";
import { log } from "./logger.js";
import { postedSignals, repliedTweets, schema, seenSignals, kvState } from "./schema.js";

const { Pool } = pg;

export type Interval = "15min" | "day" | "month" | string | number;

export interface Store {
  markSeen(type: string, ref: string): Promise<boolean>;
  isSeen(type: string, ref: string): Promise<boolean>;
  markPosted(signalRef: string, tweetId: string, text: string): Promise<boolean>;
  isPosted(signalRef: string): Promise<boolean>;
  hasReplied(tweetId: string): Promise<boolean>;
  markReplied(tweetId: string, authorId: string): Promise<boolean>;
  countReplies(interval: Interval): Promise<number>;
  getKv(key: string): Promise<string | null>;
  setKv(key: string, value: string): Promise<void>;
}

function intervalSince(interval: Interval): Date {
  const now = Date.now();
  if (typeof interval === "number") return new Date(now - interval);
  const key = String(interval).toLowerCase().replace(/\s+/g, "");
  const map: Record<string, number> = {
    "15min": 15 * 60_000,
    "15minutes": 15 * 60_000,
    day: 24 * 60 * 60_000,
    "1day": 24 * 60 * 60_000,
    month: 30 * 24 * 60 * 60_000,
    "30days": 30 * 24 * 60 * 60_000,
  };
  const ms = map[key];
  if (!ms) throw new Error(`unknown interval: ${interval}`);
  return new Date(now - ms);
}

class MemoryStore implements Store {
  private seen = new Set<string>();
  private posted = new Set<string>();
  private replies = new Map<string, { authorId: string; repliedAt: Date }>();
  private kv = new Map<string, string>();

  async markSeen(type: string, ref: string): Promise<boolean> {
    const key = `${type}:${ref}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  async isSeen(type: string, ref: string): Promise<boolean> {
    return this.seen.has(`${type}:${ref}`);
  }

  async markPosted(signalRef: string, tweetId: string, text: string): Promise<boolean> {
    if (this.posted.has(signalRef)) return false;
    this.posted.add(signalRef);
    void tweetId;
    void text;
    return true;
  }

  async isPosted(signalRef: string): Promise<boolean> {
    return this.posted.has(signalRef);
  }

  async hasReplied(tweetId: string): Promise<boolean> {
    return this.replies.has(tweetId);
  }

  async markReplied(tweetId: string, authorId: string): Promise<boolean> {
    if (this.replies.has(tweetId)) return false;
    this.replies.set(tweetId, { authorId, repliedAt: new Date() });
    return true;
  }

  async countReplies(interval: Interval): Promise<number> {
    const since = intervalSince(interval);
    let n = 0;
    for (const row of this.replies.values()) {
      if (row.repliedAt >= since) n += 1;
    }
    return n;
  }

  async getKv(key: string): Promise<string | null> {
    return this.kv.get(key) ?? null;
  }

  async setKv(key: string, value: string): Promise<void> {
    this.kv.set(key, value);
  }
}

class PgStore implements Store {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async markSeen(type: string, ref: string): Promise<boolean> {
    const rows = await this.db
      .insert(seenSignals)
      .values({ type, ref })
      .onConflictDoNothing({ target: [seenSignals.type, seenSignals.ref] })
      .returning({ id: seenSignals.id });
    return rows.length > 0;
  }

  async isSeen(type: string, ref: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: seenSignals.id })
      .from(seenSignals)
      .where(and(eq(seenSignals.type, type), eq(seenSignals.ref, ref)))
      .limit(1);
    return rows.length > 0;
  }

  async markPosted(signalRef: string, tweetId: string, text: string): Promise<boolean> {
    const rows = await this.db
      .insert(postedSignals)
      .values({ signalRef, tweetId, text })
      .onConflictDoNothing({ target: postedSignals.signalRef })
      .returning({ id: postedSignals.id });
    return rows.length > 0;
  }

  async isPosted(signalRef: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: postedSignals.id })
      .from(postedSignals)
      .where(eq(postedSignals.signalRef, signalRef))
      .limit(1);
    return rows.length > 0;
  }

  async hasReplied(tweetId: string): Promise<boolean> {
    const rows = await this.db
      .select({ tweetId: repliedTweets.tweetId })
      .from(repliedTweets)
      .where(eq(repliedTweets.tweetId, tweetId))
      .limit(1);
    return rows.length > 0;
  }

  async markReplied(tweetId: string, authorId: string): Promise<boolean> {
    const rows = await this.db
      .insert(repliedTweets)
      .values({ tweetId, authorId })
      .onConflictDoNothing({ target: repliedTweets.tweetId })
      .returning({ tweetId: repliedTweets.tweetId });
    return rows.length > 0;
  }

  async countReplies(interval: Interval): Promise<number> {
    const since = intervalSince(interval);
    const rows = await this.db
      .select({ n: count() })
      .from(repliedTweets)
      .where(gte(repliedTweets.repliedAt, since));
    return Number(rows[0]?.n ?? 0);
  }

  async getKv(key: string): Promise<string | null> {
    const rows = await this.db.select().from(kvState).where(eq(kvState.key, key)).limit(1);
    return rows[0]?.value ?? null;
  }

  async setKv(key: string, value: string): Promise<void> {
    await this.db
      .insert(kvState)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: kvState.key,
        set: { value, updatedAt: new Date() },
      });
  }
}

let store: Store = new MemoryStore();
let pool: pg.Pool | null = null;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS seen_signals (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, ref)
);
CREATE TABLE IF NOT EXISTS posted_signals (
  id BIGSERIAL PRIMARY KEY,
  signal_ref TEXT NOT NULL UNIQUE,
  tweet_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS replied_tweets (
  tweet_id TEXT PRIMARY KEY,
  author_id VARCHAR(64) NOT NULL,
  replied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS kv_state (
  key VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function initDb(): Promise<Store> {
  if (!config.databaseUrl) {
    if (!flags.dryRun) {
      throw new Error("DATABASE_URL is required outside --dry-run");
    }
    log.warn("no DATABASE_URL — using in-memory store (dry-run)");
    store = new MemoryStore();
    return store;
  }

  pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  await pool.query(INIT_SQL);
  const db = drizzle(pool, { schema });
  store = new PgStore(db);
  log.info("postgres store ready");
  return store;
}

export function getStore(): Store {
  return store;
}

export async function countReplies(interval: Interval): Promise<number> {
  return store.countReplies(interval);
}

export async function hasReplied(tweetId: string): Promise<boolean> {
  return store.hasReplied(tweetId);
}

export async function markReplied(tweetId: string, authorId: string): Promise<boolean> {
  return store.markReplied(tweetId, authorId);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function createMemoryStore(): Store {
  return new MemoryStore();
}

void sql;
