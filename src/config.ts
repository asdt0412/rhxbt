import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) loadDotenv({ path: envPath });
else loadDotenv();

function envString(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  return "";
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number, got ${raw}`);
  }
  return n;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

const argv = process.argv.slice(2);

export const flags = {
  dryRun: argv.includes("--dry-run") || envBool("DRY_RUN", false),
  selfTest: argv.includes("--self-test"),
  fixtures: argv.includes("--fixtures"),
  once: argv.includes("--once"),
};

export const config = {
  rpcUrl: envString("RPC_URL", "https://rpc.mainnet.chain.robinhood.com"),
  rpcWsUrl: envString("RPC_WS_URL", "wss://rpc.mainnet.chain.robinhood.com"),
  hypersyncUrl: envString("HYPERSYNC_URL", "https://robinhood.hypersync.xyz"),
  blockscoutUrl: envString("BLOCKSCOUT_URL", "https://robinhoodchain.blockscout.com"),
  blockscoutApi: envString("BLOCKSCOUT_API", "https://robinhoodchain.blockscout.com/api"),
  databaseUrl: envString("DATABASE_URL"),
  anthropicApiKey: envString("ANTHROPIC_API_KEY"),
  anthropicModel: envString("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
  xApiKey: envString("X_API_KEY"),
  xApiSecret: envString("X_API_SECRET"),
  xAccessToken: envString("X_ACCESS_TOKEN"),
  xAccessSecret: envString("X_ACCESS_SECRET"),
  xUserId: envString("X_USER_ID"),
  maxRepliesPer15Min: envInt("MAX_REPLIES_PER_15MIN", 10),
  maxRepliesPerDay: envInt("MAX_REPLIES_PER_DAY", 100),
  maxRepliesPerMonth: envInt("MAX_REPLIES_PER_MONTH", 1500),
  maxPostsPerCycle: envInt("MAX_POSTS_PER_CYCLE", 2),
  minFollowers: envInt("MIN_FOLLOWERS", 50),
  minLiquidityUsd: envInt("MIN_LIQUIDITY_USD", 5000),
  stockMoveThresholdPct: Number(envString("STOCK_MOVE_THRESHOLD_PCT", "1.5")),
  bridgeAnomalyUsd: envInt("BRIDGE_ANOMALY_USD", 250_000),
  uniV3Factory: envString(
    "UNI_V3_FACTORY",
    "0x1f7d7550B1b028F7571E69A784071F0205FD2EfA",
  ),
  l2GatewayRouter: envString(
    "L2_GATEWAY_ROUTER",
    "0x1E324B9316138CA9a73F960213621AD1aaf01B89",
  ),
} as const;

export function hasXCredentials(): boolean {
  return Boolean(
    config.xApiKey &&
      config.xApiSecret &&
      config.xAccessToken &&
      config.xAccessSecret &&
      config.xUserId,
  );
}

export function hasAnthropic(): boolean {
  return Boolean(config.anthropicApiKey);
}

export function assertProductionConfig(): void {
  if (flags.dryRun) return;
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
  if (!hasXCredentials()) {
    missing.push("X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_SECRET/X_USER_ID");
  }
  if (missing.length > 0) {
    throw new Error(`missing required env for live mode: ${missing.join(", ")}`);
  }
}
