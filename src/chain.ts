import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  webSocket,
  type Chain,
  type PublicClient,
  type Transport,
  type WebSocketTransport,
} from "viem";
import { config } from "./config.js";
import {
  MULTICALL3,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  RPC_HTTP,
  UNI_MULTICALL,
} from "./constants.js";
import { log } from "./logger.js";

export const robinhoodChain: Chain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_HTTP], webSocket: [config.rpcWsUrl] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
  contracts: {
    multicall3: { address: MULTICALL3 },
  },
  formatters: undefined,
  fees: undefined,
});

export const robinhoodTestnet: Chain = defineChain({
  id: ROBINHOOD_TESTNET_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpcUrl] },
  },
});

export const publicClient: PublicClient<Transport, typeof robinhoodChain> = createPublicClient({
  chain: robinhoodChain,
  transport: fallback([
    http(config.rpcUrl, { timeout: 20_000, retryCount: 2 }),
    http(RPC_HTTP, { timeout: 20_000, retryCount: 1 }),
  ]),
  batch: { multicall: { batchSize: 1024 } },
});

let wsClientInternal: PublicClient<WebSocketTransport, typeof robinhoodChain> | null = null;

export function getWsClient(): PublicClient<WebSocketTransport, typeof robinhoodChain> | null {
  if (wsClientInternal) return wsClientInternal;
  if (!config.rpcWsUrl) return null;
  try {
    wsClientInternal = createPublicClient({
      chain: robinhoodChain,
      transport: webSocket(config.rpcWsUrl, {
        reconnect: true,
        retryCount: 5,
        timeout: 30_000,
      }),
    });
    return wsClientInternal;
  } catch (err) {
    log.warn("ws client init failed", { err: String(err) });
    return null;
  }
}

export const wsClient = new Proxy({} as PublicClient<WebSocketTransport, typeof robinhoodChain>, {
  get(_target, prop, receiver) {
    const client = getWsClient();
    if (!client) {
      throw new Error("ws client unavailable — set RPC_WS_URL");
    }
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const UNI_MULTICALL_ADDRESS = UNI_MULTICALL;
