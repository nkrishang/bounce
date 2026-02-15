import type { Address } from 'viem';
import type { ChainId } from './chain';

export const ADDRESSES_BY_CHAIN: Record<ChainId, {
  TRADE_ESCROW_FACTORY: Address;
  USDC: Address;
}> = {
  137: {
    TRADE_ESCROW_FACTORY: '0x0000000000000000000000000000000000000000' as Address,
    USDC: '0x0000000000000000000000000000000000000000' as Address,
  },
  8453: {
    TRADE_ESCROW_FACTORY: '0x0000000000000000000000000000000000000000' as Address,
    USDC: '0x0000000000000000000000000000000000000000' as Address,
  },
  143: {
    TRADE_ESCROW_FACTORY: '0x0000000000000000000000000000000000000000' as Address,
    USDC: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

export type ContractKey = keyof (typeof ADDRESSES_BY_CHAIN)[137];

export function getContractAddress(chainId: ChainId, key: ContractKey): Address {
  return ADDRESSES_BY_CHAIN[chainId][key];
}
