import { formatUnits, type Address } from "viem";
import { config } from "../config.js";
import { USDG, WETH } from "../constants.js";
import { getStore } from "../db.js";
import { queryRawEvents } from "../ingest/eventStore.js";
import { tokenUsd } from "../prices.js";
import type { Signal } from "../types.js";
import { hourKey } from "./defs.js";

function amountUsd(token: string, amount: bigint, pxEth: number | null, pxUsdg: number | null): number {
  const t = token.toLowerCase();
  if (t === USDG.toLowerCase() && pxUsdg) return Number(formatUnits(amount, 6)) * pxUsdg;
  if (t === WETH.toLowerCase() && pxEth) return Number(formatUnits(amount, 18)) * pxEth;
  if (pxUsdg && amount > 10n ** 12n) return Number(formatUnits(amount, 6)) * pxUsdg;
  if (pxEth) return Number(formatUnits(amount, 18)) * pxEth;
  return 0;
}

export async function collectBridge(): Promise<Signal[]> {
  const [pxEth, pxUsdg] = await Promise.all([tokenUsd(WETH), tokenUsd(USDG)]);
  const events = await queryRawEvents({
    names: ["DepositFinalized", "WithdrawalInitiated", "Transfer"],
    limit: 300,
  });

  let inflow = 0;
  let outflow = 0;
  let usdgMint = 0;
  let usdgBurn = 0;

  for (const ev of events) {
    if (ev.eventName === "DepositFinalized") {
      inflow += amountUsd(String(ev.args.l1Token ?? ""), BigInt(String(ev.args.amount ?? "0")), pxEth, pxUsdg);
    } else if (ev.eventName === "WithdrawalInitiated") {
      outflow += amountUsd(String(ev.args.l1Token ?? ""), BigInt(String(ev.args.amount ?? "0")), pxEth, pxUsdg);
    } else if (ev.eventName === "Transfer" && ev.address.toLowerCase() === USDG.toLowerCase()) {
      const value = Number(formatUnits(BigInt(String(ev.args.value ?? "0")), 6)) * (pxUsdg ?? 1);
      if (ev.args.mint === true) usdgMint += value;
      if (ev.args.burn === true) usdgBurn += value;
    }
  }

  const signals: Signal[] = [];
  const net = inflow - outflow;
  const volume = inflow + outflow;
  const store = getStore();
  const key = "bridge_avg_v1";
  let samples: number[] = [];
  const raw = await store.getKv(key);
  if (raw) {
    try {
      samples = JSON.parse(raw) as number[];
    } catch {
      samples = [];
    }
  }
  if (volume > 0) {
    samples = [...samples, volume].slice(-24);
    await store.setKv(key, JSON.stringify(samples));
  }
  const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  const anomalous =
    Math.abs(net) >= config.bridgeAnomalyUsd || (avg > 0 && volume >= avg * 3 && volume >= 50_000);

  if (anomalous) {
    signals.push({
      beat: "bridge",
      type: "bridge",
      ref: `bridge:${hourKey()}:${net >= 0 ? "in" : "out"}:${Math.round(Math.abs(net) / 1000)}k`,
      value: net,
      meta: {
        inflowUsd: Number(inflow.toFixed(0)),
        outflowUsd: Number(outflow.toFixed(0)),
        netUsd: Number(net.toFixed(0)),
        avgHourlyUsd: Number(avg.toFixed(0)),
      },
    });
  }

  const supplyNet = usdgMint - usdgBurn;
  if (Math.abs(supplyNet) >= 100_000) {
    signals.push({
      beat: "bridge",
      type: "usdg_supply",
      ticker: "USDG",
      ref: `usdg:${hourKey()}:${supplyNet >= 0 ? "mint" : "burn"}:${Math.round(Math.abs(supplyNet) / 1000)}k`,
      value: supplyNet,
      meta: {
        mintUsd: Number(usdgMint.toFixed(0)),
        burnUsd: Number(usdgBurn.toFixed(0)),
        netUsd: Number(supplyNet.toFixed(0)),
      },
    });
  }
  return signals;
}
