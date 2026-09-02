import { formatUnits } from "viem";
import { config } from "../config.js";
import { MORPHO_VAULTS } from "../constants.js";
import { queryRawEvents } from "../ingest/eventStore.js";
import type { Signal } from "../types.js";

export async function collectProtocols(): Promise<Signal[]> {
  const signals: Signal[] = [];

  try {
    const url = `${config.blockscoutUrl.replace(/\/$/, "")}/api/v2/smart-contracts?filter=verified`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (res.ok) {
      const json = (await res.json()) as {
        items?: Array<{ address?: { hash?: string }; name?: string; verified_at?: string }>;
      };
      for (const item of (json.items ?? []).slice(0, 8)) {
        const addr = item.address?.hash;
        if (!addr) continue;
        signals.push({
          beat: "protocols",
          type: "verified_contract",
          ref: `verified:${addr.toLowerCase()}`,
          value: 1,
          meta: { address: addr, name: item.name ?? null, verifiedAt: item.verified_at ?? null },
        });
      }
    }
  } catch {
    /* optional */
  }

  const vaultEvents = await queryRawEvents({
    names: ["VaultDeposit", "VaultWithdraw"],
    limit: 80,
  });
  let earnUsd = 0;
  for (const ev of vaultEvents) {
    if (!MORPHO_VAULTS.some((v) => v.toLowerCase() === ev.address.toLowerCase())) continue;
    earnUsd += 1;
  }
  if (vaultEvents.length > 0) {
    signals.push({
      beat: "protocols",
      type: "protocol_activity",
      ticker: "EARN",
      ref: `earn:${new Date().toISOString().slice(0, 13)}:${vaultEvents.length}`,
      value: vaultEvents.length,
      meta: {
        venue: "morpho-earn",
        events: vaultEvents.length,
        hintUsd: Number(formatUnits(0n, 6)),
        earnEvents: earnUsd,
      },
    });
  }

  return signals;
}
