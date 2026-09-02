import { parseEther, type Address } from "viem";
import { publicClient } from "./chain.js";
import { config } from "./config.js";
import { UNI_QUOTER_V2, USDG } from "./constants.js";
import { log } from "./logger.js";

const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export async function sellSimulates(token: Address, fee: number): Promise<boolean> {
  try {
    await publicClient.simulateContract({
      address: UNI_QUOTER_V2,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: token,
          tokenOut: USDG,
          amountIn: parseEther("0.01"),
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    return true;
  } catch (err) {
    log.debug("sell sim failed", { token, fee, err: String(err) });
    return false;
  }
}

export async function contractRedFlags(address: string): Promise<string[]> {
  const flags: string[] = [];
  try {
    const url = `${config.blockscoutUrl.replace(/\/$/, "")}/api/v2/smart-contracts/${address}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (res.status === 404) {
      flags.push("unverified");
      return flags;
    }
    if (!res.ok) return flags;
    const json = (await res.json()) as {
      is_verified?: boolean;
      is_fully_verified?: boolean;
      proxy_type?: string | null;
    };
    if (json.is_verified === false && json.is_fully_verified === false) flags.push("unverified");
    if (!json.is_verified && json.is_fully_verified === undefined) flags.push("unverified");
  } catch {
    /* optional */
  }
  return flags;
}
