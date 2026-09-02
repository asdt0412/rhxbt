import { keccak256, toHex } from "viem";

export const TOPICS = {
  PoolCreated: keccak256(toHex("PoolCreated(address,address,uint24,int24,address)")),
  Mint: keccak256(toHex("Mint(address,address,int24,int24,uint128,uint256,uint256)")),
  Burn: keccak256(toHex("Burn(address,int24,int24,uint128,uint256,uint256)")),
  Swap: keccak256(toHex("Swap(address,address,int256,int256,uint160,uint128,int24)")),
  Transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  DepositFinalized: keccak256(toHex("DepositFinalized(address,address,address,uint256)")),
  WithdrawalInitiated: keccak256(toHex("WithdrawalInitiated(address,address,address,uint256,uint256,uint256)")),
  VaultDeposit: keccak256(toHex("Deposit(address,address,uint256,uint256)")),
  VaultWithdraw: keccak256(toHex("Withdraw(address,address,address,uint256,uint256)")),
} as const;

export function topicName(topic0: string): string | null {
  const t = topic0.toLowerCase();
  for (const [name, hash] of Object.entries(TOPICS)) {
    if (hash.toLowerCase() === t) return name;
  }
  return null;
}
