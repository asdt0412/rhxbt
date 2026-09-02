import type { Address } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_ID_HEX = "0x1237";
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;

export const RPC_HTTP = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";
export const EXPLORER_API = "https://robinhoodchain.blockscout.com/api";
export const HYPERSYNC_URL = "https://robinhood.hypersync.xyz";

export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;

export const UNI_V3_FACTORY = "0x1f7d7550B1b028F7571E69A784071F0205FD2EfA" as Address;
export const UNI_QUOTER_V2 = "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7" as Address;
export const UNI_MULTICALL = "0x282a3c4d320cc7f0d5eaf56b8029e4b88338f0a3" as Address;
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

export const L2_GATEWAY_ROUTER = "0x1E324B9316138CA9a73F960213621AD1aaf01B89" as Address;

export const FEE_TIERS = [100, 500, 3000, 10000] as const;

export const ON_TOPIC_TICKERS = [
  "nvda",
  "aapl",
  "tsla",
  "hood",
  "msft",
  "amzn",
  "googl",
] as const;

export const ON_TOPIC_WORDS = [
  "robinhood",
  "chain",
  "pool",
  "liquidity",
  "bridge",
  "token",
  "defi",
  "earn",
  "usdg",
] as const;

export const QUESTION_HINTS = ["how", "what", "price", "prix", "combien", "quand"] as const;

export type StockToken = {
  ticker: string;
  address: Address;
  feed: Address;
  decimals: number;
};

/** Canonical stock tokens + Chainlink USD feeds (8 decimals). HOOD has no token on 4663. */
export const STOCK_TOKENS: readonly StockToken[] = [
  {
    ticker: "NVDA",
    address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
    decimals: 18,
  },
  {
    ticker: "AAPL",
    address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    feed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
    decimals: 18,
  },
  {
    ticker: "TSLA",
    address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    feed: "0x4A1166a659A55625345e9515b32adECea5547C38",
    decimals: 18,
  },
  {
    ticker: "MSFT",
    address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
    feed: "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E",
    decimals: 18,
  },
  {
    ticker: "AMZN",
    address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
    feed: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C",
    decimals: 18,
  },
  {
    ticker: "GOOGL",
    address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
    feed: "0xF6f373a037c30F0e5010d854385cA89185AE638b",
    decimals: 18,
  },
  {
    ticker: "META",
    address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
    feed: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1",
    decimals: 18,
  },
  {
    ticker: "COIN",
    address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b",
    feed: "0xA3a468A452940B7D6b69991207B508c609a98Ef2",
    decimals: 18,
  },
] as const;

export const CRYPTO_FEEDS = {
  ETH_USD: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9" as Address,
  USDG_USD: "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2" as Address,
} as const;

const byTicker = new Map(STOCK_TOKENS.map((t) => [t.ticker.toLowerCase(), t]));
const byAddress = new Map(STOCK_TOKENS.map((t) => [t.address.toLowerCase(), t]));

export function stockByTicker(ticker: string): StockToken | undefined {
  return byTicker.get(ticker.trim().toLowerCase());
}

export function stockByAddress(address: string): StockToken | undefined {
  return byAddress.get(address.toLowerCase());
}

export function tokenLabel(address: string): string {
  const lower = address.toLowerCase();
  if (lower === WETH.toLowerCase()) return "WETH";
  if (lower === USDG.toLowerCase()) return "USDG";
  return stockByAddress(address)?.ticker ?? address.slice(0, 10);
}
