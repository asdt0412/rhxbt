/**
 * Envio HyperIndex handlers. Run via `npx envio dev` from /indexer.
 * The agent also embeds an equivalent HyperSync ingest (src/ingest) that
 * writes the same RawEvent shape into the worker Postgres.
 */
type Ctx = {
  RawEvent: { set: (row: Record<string, unknown>) => void };
  WatchedPool: { set: (row: Record<string, unknown>) => void };
  UniswapV3Pool?: { addAddress?: (addr: string) => void };
};

type Ev = {
  srcAddress: string;
  logIndex: number;
  transaction: { hash: string };
  block: { number: number; timestamp?: number };
  params: Record<string, unknown>;
};

function persist(eventName: string, event: Ev, context: Ctx): void {
  context.RawEvent.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    eventName,
    address: event.srcAddress.toLowerCase(),
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    logIndex: event.logIndex,
    timestamp: event.block.timestamp !== undefined ? BigInt(event.block.timestamp) : undefined,
    argsJson: JSON.stringify(event.params),
  });
}

export async function handlePoolCreated({ event, context }: { event: Ev; context: Ctx }): Promise<void> {
  persist("PoolCreated", event, context);
  const pool = String(event.params.pool ?? "");
  if (pool) {
    context.WatchedPool.set({
      id: pool.toLowerCase(),
      token0: String(event.params.token0 ?? ""),
      token1: String(event.params.token1 ?? ""),
      fee: Number(event.params.fee ?? 0),
      createdBlock: BigInt(event.block.number),
    });
    context.UniswapV3Pool?.addAddress?.(pool);
  }
}

export async function handleGeneric({ event, context }: { event: Ev & { name?: string }; context: Ctx }): Promise<void> {
  persist(event.name ?? "Unknown", event, context);
}
