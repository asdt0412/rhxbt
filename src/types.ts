export type SignalType = "stock_move" | "new_pool" | "bridge" | "wallet";

export type Signal = {
  type: SignalType;
  ticker?: string;
  ref: string;
  value: number;
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
