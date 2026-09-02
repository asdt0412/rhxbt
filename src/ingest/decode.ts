import { decodeEventLog } from "viem";
import { burnEvent, l2GatewayAbi, mintEvent, poolCreatedEvent, swapEvent } from "../abis.js";
import type { HyperLog } from "../hypersync.js";
import type { RawEvent } from "../types.js";
import { topicName } from "./topics.js";

function topicAddress(topic?: string): string | undefined {
  if (!topic || topic.length < 42) return undefined;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function hexToBigInt(data: string): bigint {
  if (!data || data === "0x") return 0n;
  try {
    return BigInt(data);
  } catch {
    return 0n;
  }
}

export function decodeHyperLog(log: HyperLog, fallbackIndex = 0): RawEvent | null {
  const topic0 = log.topics[0];
  if (!topic0) return null;
  const name = topicName(topic0);
  if (!name) return null;
  const blockNumber = log.blockNumber ?? 0;
  const txHash = log.transactionHash ?? `unknown-${blockNumber}-${fallbackIndex}`;
  const id = `${txHash}-${fallbackIndex}`;
  const address = log.address.toLowerCase();
  const base = {
    id,
    eventName: name,
    address,
    txHash,
    blockNumber,
    logIndex: fallbackIndex,
    timestamp: null as number | null,
    args: {} as Record<string, unknown>,
  };

  try {
    if (name === "PoolCreated") {
      const decoded = decodeEventLog({
        abi: [poolCreatedEvent],
        eventName: "PoolCreated",
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      base.args = {
        token0: decoded.args.token0,
        token1: decoded.args.token1,
        fee: Number(decoded.args.fee),
        pool: decoded.args.pool,
      };
      return base;
    }
    if (name === "Swap") {
      const decoded = decodeEventLog({
        abi: [swapEvent],
        eventName: "Swap",
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      base.args = {
        amount0: decoded.args.amount0?.toString(),
        amount1: decoded.args.amount1?.toString(),
      };
      return base;
    }
    if (name === "Mint") {
      const decoded = decodeEventLog({
        abi: [mintEvent],
        eventName: "Mint",
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      base.args = {
        amount0: decoded.args.amount0?.toString(),
        amount1: decoded.args.amount1?.toString(),
        amount: decoded.args.amount?.toString(),
      };
      return base;
    }
    if (name === "Burn") {
      const decoded = decodeEventLog({
        abi: [burnEvent],
        eventName: "Burn",
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      base.args = {
        amount0: decoded.args.amount0?.toString(),
        amount1: decoded.args.amount1?.toString(),
        amount: decoded.args.amount?.toString(),
      };
      return base;
    }
    if (name === "DepositFinalized" || name === "WithdrawalInitiated") {
      const decoded = decodeEventLog({
        abi: l2GatewayAbi,
        eventName: name,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      const args = decoded.args as { l1Token?: string; amount?: bigint; from?: string; to?: string };
      base.args = {
        l1Token: args.l1Token,
        from: args.from,
        to: args.to,
        amount: args.amount?.toString(),
      };
      return base;
    }
  } catch {
    /* fall through to generic */
  }

  if (name === "Transfer") {
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    const value = hexToBigInt(log.data).toString();
    const zero = "0x0000000000000000000000000000000000000000";
    base.args = { from, to, value, mint: from === zero, burn: to === zero };
    return base;
  }

  if (name === "VaultDeposit" || name === "VaultWithdraw") {
    base.args = {
      caller: topicAddress(log.topics[1]),
      owner: topicAddress(log.topics[2]),
      raw: log.data,
    };
    return base;
  }

  base.args = { topics: log.topics, data: log.data };
  return base;
}
