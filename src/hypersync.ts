import { config } from "./config.js";
import { log } from "./logger.js";

export type HyperLog = {
  address: string;
  data: string;
  topics: string[];
  transactionHash?: string;
  blockNumber?: number;
};

export type LogSelection = {
  address?: string[];
  topic0: string[];
};

type QueryBody = {
  from_block: number;
  to_block?: number;
  logs: Array<{ address?: string[]; topics?: Array<string[] | null> }>;
  field_selection: {
    log: string[];
  };
  max_num_logs?: number;
};

export async function queryLogsMany(opts: {
  fromBlock: number;
  toBlock?: number;
  selections: LogSelection[];
}): Promise<HyperLog[]> {
  if (opts.selections.length === 0) return [];
  const body: QueryBody = {
    from_block: opts.fromBlock,
    ...(opts.toBlock !== undefined ? { to_block: opts.toBlock } : {}),
    logs: opts.selections.map((s) => ({
      ...(s.address?.length ? { address: s.address.map((a) => a.toLowerCase()) } : {}),
      topics: [s.topic0],
    })),
    field_selection: {
      log: ["address", "data", "topic0", "topic1", "topic2", "topic3", "transaction_hash", "block_number"],
    },
    max_num_logs: 4000,
  };

  const url = `${config.hypersyncUrl.replace(/\/$/, "")}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`hypersync ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: { logs?: Array<Record<string, unknown>> };
    logs?: Array<Record<string, unknown>>;
  };
  const raw = json.data?.logs ?? json.logs ?? [];
  return raw.map(normalizeLog);
}

export async function queryLogs(opts: {
  fromBlock: number;
  toBlock?: number;
  address?: string;
  topic0: string;
}): Promise<HyperLog[]> {
  return queryLogsMany({
    fromBlock: opts.fromBlock,
    toBlock: opts.toBlock,
    selections: [{ address: opts.address ? [opts.address] : undefined, topic0: [opts.topic0] }],
  });
}

function normalizeLog(row: Record<string, unknown>): HyperLog {
  const topics = [
    asHex(row.topic0 ?? row.Topic0),
    asHex(row.topic1 ?? row.Topic1),
    asHex(row.topic2 ?? row.Topic2),
    asHex(row.topic3 ?? row.Topic3),
  ].filter((t): t is string => Boolean(t));
  return {
    address: String(row.address ?? row.Address ?? ""),
    data: String(row.data ?? row.Data ?? "0x"),
    topics,
    transactionHash: row.transaction_hash
      ? String(row.transaction_hash)
      : row.TransactionHash
        ? String(row.TransactionHash)
        : undefined,
    blockNumber:
      typeof row.block_number === "number"
        ? row.block_number
        : typeof row.BlockNumber === "number"
          ? row.BlockNumber
          : undefined,
  };
}

function asHex(v: unknown): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

export async function queryLogsSafe(opts: Parameters<typeof queryLogs>[0]): Promise<HyperLog[]> {
  try {
    return await queryLogs(opts);
  } catch (err) {
    log.warn("hypersync query failed", { err: String(err) });
    return [];
  }
}

export async function queryLogsManySafe(opts: Parameters<typeof queryLogsMany>[0]): Promise<HyperLog[]> {
  try {
    return await queryLogsMany(opts);
  } catch (err) {
    log.warn("hypersync query failed", { err: String(err) });
    return [];
  }
}
