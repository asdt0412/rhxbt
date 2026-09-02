export const BEATS = [
  "launches",
  "liquidity",
  "stockTokens",
  "whales",
  "bridge",
  "protocols",
  "vitals",
  "narrative",
] as const;

export type Beat = (typeof BEATS)[number];

export type SignalKind =
  | "stock_move"
  | "stock_basis"
  | "new_pool"
  | "first_liq"
  | "graduation"
  | "lp_mint"
  | "lp_burn"
  | "liq_pull"
  | "honeypot"
  | "whale_transfer"
  | "bridge"
  | "usdg_supply"
  | "verified_contract"
  | "protocol_activity"
  | "vitals"
  | "recap"
  | "narrative"
  | "wallet";

/** @deprecated use SignalKind — kept as alias for older call sites */
export type SignalType = SignalKind;

export type Signal = {
  beat: Beat;
  type: SignalKind;
  ticker?: string;
  ref: string;
  value: number;
  score?: number;
  meta: Record<string, unknown>;
};

export type AnalyzeResult = { post: string } | { post: null };

export type ReplyResult = { reply: string } | { reply: null };

export type Mention = {
  tweetId: string;
  authorId: string;
  authorUsername?: string;
  authorFollowers: number;
  likes: number;
  text: string;
  conversationId?: string;
  parentText?: string;
  thread: string[];
  threadDepth: number;
  createdAt?: string;
};

export type ScoredMention = Mention & {
  score: number;
  isQuestion: boolean;
};

export type StockQuote = {
  ticker: string;
  priceUsd: number;
  updatedAt: number;
  marketClosed: boolean;
  changePct?: number;
  feed: string;
};

export type PoolStats = {
  pool: string;
  tokenA: string;
  tokenB: string;
  fee: number;
  liquidityUsd: number;
  volume24hUsd: number;
  price: number;
};

export type TokenInfo = {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  holders: number | null;
  totalSupply: string | null;
};

export type RateLimitState = {
  remaining: number | null;
  resetAt: number | null;
  ok: boolean;
};

export type RawEvent = {
  id: string;
  eventName: string;
  address: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: number | null;
  args: Record<string, unknown>;
};
