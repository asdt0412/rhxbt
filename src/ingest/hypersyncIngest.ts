import { publicClient } from "../chain.js";
import { config } from "../config.js";
import {
  L2_GATEWAY_ROUTER,
  MORPHO_VAULTS,
  SEED_POOLS,
  STOCK_TOKENS,
  UNI_V3_FACTORY,
  USDG,
  WETH,
} from "../constants.js";
import { getStore } from "../db.js";
import { queryLogsManySafe, type LogSelection } from "../hypersync.js";
import { log } from "../logger.js";
import { decodeHyperLog } from "./decode.js";
import { insertRawEvents, queryRawEvents } from "./eventStore.js";
import { TOPICS } from "./topics.js";

const CURSOR = "ingest_from_block";
const POOLS_KEY = "watched_pools";

async function watchedPools(): Promise<string[]> {
  const raw = await getStore().getKv(POOLS_KEY);
  const extra: string[] = raw ? (JSON.parse(raw) as string[]) : [];
  return [...new Set([...SEED_POOLS.map((p) => p.toLowerCase()), ...extra.map((p) => p.toLowerCase())])];
}

async function rememberPool(pool: string): Promise<void> {
  const pools = await watchedPools();
  const lower = pool.toLowerCase();
  if (pools.includes(lower)) return;
  pools.push(lower);
  await getStore().setKv(POOLS_KEY, JSON.stringify(pools));
}

function tokenAddresses(): string[] {
  return [USDG, WETH, ...STOCK_TOKENS.map((t) => t.address)].map((a) => a.toLowerCase());
}

export async function runIngest(): Promise<number> {
  const latest = await publicClient.getBlockNumber();
  const store = getStore();
  const saved = await store.getKv(CURSOR);
  const lookback = BigInt(config.ingestLookbackBlocks);
  const fromBlock = saved ? BigInt(saved) : latest > lookback ? latest - lookback : 0n;
  if (fromBlock >= latest) return 0;

  const pools = await watchedPools();
  const selections: LogSelection[] = [
    { address: [config.uniV3Factory || UNI_V3_FACTORY], topic0: [TOPICS.PoolCreated] },
    { address: pools, topic0: [TOPICS.Mint, TOPICS.Burn, TOPICS.Swap] },
    { address: tokenAddresses(), topic0: [TOPICS.Transfer] },
    { address: [config.l2GatewayRouter || L2_GATEWAY_ROUTER], topic0: [TOPICS.DepositFinalized, TOPICS.WithdrawalInitiated] },
    { address: [...MORPHO_VAULTS], topic0: [TOPICS.VaultDeposit, TOPICS.VaultWithdraw] },
  ];

  const logs = await queryLogsManySafe({
    fromBlock: Number(fromBlock),
    toBlock: Number(latest),
    selections,
  });

  const events = logs
    .map((row, i) => decodeHyperLog(row, i))
    .filter((e): e is NonNullable<typeof e> => e !== null);

  for (const ev of events) {
    if (ev.eventName === "PoolCreated" && typeof ev.args.pool === "string") {
      await rememberPool(ev.args.pool);
    }
  }

  const inserted = await insertRawEvents(events);
  await store.setKv(CURSOR, latest.toString());
  log.info("hypersync ingest", {
    fromBlock: fromBlock.toString(),
    toBlock: latest.toString(),
    logs: logs.length,
    decoded: events.length,
    inserted,
  });
  return inserted;
}

export async function recentPoolCreates(fromBlock = 0) {
  return queryRawEvents({ names: ["PoolCreated"], fromBlock, limit: 80 });
}
