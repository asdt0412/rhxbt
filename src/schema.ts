import { bigint, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

export const seenSignals = pgTable(
  "seen_signals",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    type: varchar("type", { length: 64 }).notNull(),
    ref: text("ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("seen_signals_type_ref").on(t.type, t.ref)],
);

export const postedSignals = pgTable(
  "posted_signals",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    signalRef: text("signal_ref").notNull().unique(),
    tweetId: text("tweet_id").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const repliedTweets = pgTable("replied_tweets", {
  tweetId: text("tweet_id").primaryKey(),
  authorId: varchar("author_id", { length: 64 }).notNull(),
  repliedAt: timestamp("replied_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kvState = pgTable("kv_state", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = { seenSignals, postedSignals, repliedTweets, kvState };
