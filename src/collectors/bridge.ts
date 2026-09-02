import { decodeEventLog, formatUnits, type Address, type Log } from "viem";
import { l2GatewayAbi, l2GatewayRouterAbi } from "../abis.js";
import { publicClient } from "../chain.js";
import { config } from "../config.js";
import { L2_GATEWAY_ROUTER, USDG, WETH } from "../constants.js";
import { getStore } from "../db.js";
import { log } from "../logger.js";
import { tokenUsd } from "../prices.js";
import type { Signal } from "../types.js";

const STATE_KEY = "bridge_window_v1";

type Window = {
  hour: string;
  inflowUsd: number;
  outflowUsd: number;
  samples: number[];
};

function hourKey(d = new Date()): string {
  return d.toISOString().slice(0, 13);
}

async function resolveGateway(): Promise<Address> {
  const router = (config.l2GatewayRouter || L2_GATEWAY_ROUTER) as Address;
  return publicClient.readContract({
    address: router,
    abi: l2GatewayRouterAbi,
    functionName: "defaultGateway",
  });
}

function amountUsd(l1Token: Address, amount: bigint, pxEth: number | null, pxUsdg: number | null): number {
  const token = l1Token.toLowerCase();
  if (token === USDG.toLowerCase() && pxUsdg) return Number(formatUnits(amount, 6)) * pxUsdg;
  if (token === WETH.toLowerCase() && pxEth) return Number(formatUnits(amount, 18)) * pxEth;
  if (pxUsdg && amount > 10n ** 12n) return Number(formatUnits(amount, 6)) * pxUsdg;
  if (pxEth) return Number(formatUnits(amount, 18)) * pxEth;
  return 0;
}

export async function collectBridge(): Promise<Signal[]> {
  try {
    const gateway = await resolveGateway();
    const latest = await publicClient.getBlockNumber();
    const lookback = 36_000n; // ~1h
    const from = latest > lookback ? latest - lookback : 0n;

    const [pxEth, pxUsdg] = await Promise.all([tokenUsd(WETH), tokenUsd(USDG)]);

    const logs: Log[] = await publicClient.getLogs({
      address: gateway,
      fromBlock: from,
      toBlock: latest,
    });

    let inflow = 0;
    let outflow = 0;
    for (const ev of logs) {
      try {
        const dep = decodeEventLog({ abi: l2GatewayAbi, eventName: "DepositFinalized", data: ev.data, topics: ev.topics });
        inflow += amountUsd(dep.args.l1Token, dep.args.amount, pxEth, pxUsdg);
        continue;
      } catch {
        /* not a deposit */
      }
      try {
        const w = decodeEventLog({
          abi: l2GatewayAbi,
          eventName: "WithdrawalInitiated",
          data: ev.data,
          topics: ev.topics,
        });
        outflow += amountUsd(w.args.l1Token as Address, w.args.amount, pxEth, pxUsdg);
      } catch {
        /* ignore */
      }
    }

    const net = inflow - outflow;
    const store = getStore();
    let window: Window = { hour: hourKey(), inflowUsd: 0, outflowUsd: 0, samples: [] };
    const raw = await store.getKv(STATE_KEY);
    if (raw) {
      try {
        window = JSON.parse(raw) as Window;
      } catch {
        /* reset */
      }
    }

    if (window.hour !== hourKey()) {
      if (window.inflowUsd + window.outflowUsd > 0) {
        window.samples.push(window.inflowUsd + window.outflowUsd);
        window.samples = window.samples.slice(-24);
      }
      window.hour = hourKey();
      window.inflowUsd = 0;
      window.outflowUsd = 0;
    }
    window.inflowUsd = inflow;
    window.outflowUsd = outflow;
    await store.setKv(STATE_KEY, JSON.stringify(window));

    const avg =
      window.samples.length > 0
        ? window.samples.reduce((a, b) => a + b, 0) / window.samples.length
        : 0;
    const volume = inflow + outflow;
    const anomalous =
      Math.abs(net) >= config.bridgeAnomalyUsd || (avg > 0 && volume >= avg * 3 && volume >= 50_000);

    if (!anomalous) {
      log.info("bridge flow normal", { inflow, outflow, net, avg });
      return [];
    }

    const ref = `bridge:${hourKey()}:${net >= 0 ? "in" : "out"}:${Math.round(Math.abs(net) / 1000)}k`;
    return [
      {
        type: "bridge",
        ref,
        value: net,
        meta: {
          inflowUsd: Number(inflow.toFixed(0)),
          outflowUsd: Number(outflow.toFixed(0)),
          netUsd: Number(net.toFixed(0)),
          avgHourlyUsd: Number(avg.toFixed(0)),
          gateway,
        },
      },
    ];
  } catch (err) {
    log.warn("bridge collector failed", { err: String(err) });
    return [];
  }
}
