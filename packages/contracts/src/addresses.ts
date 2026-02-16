import type { Address } from 'viem';
import type { ChainId } from './chain';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

export const ADDRESSES_BY_CHAIN: Record<ChainId, {
  TRADE_ESCROW_FACTORY: Address;
}> = {
  137: {
    TRADE_ESCROW_FACTORY: (process.env.NEXT_PUBLIC_POLYGON_TRADE_ESCROW_FACTORY_ADDRESS ?? process.env.POLYGON_TRADE_ESCROW_FACTORY_ADDRESS ?? ZERO) as Address,
  },
  8453: {
    TRADE_ESCROW_FACTORY: (process.env.NEXT_PUBLIC_BASE_TRADE_ESCROW_FACTORY_ADDRESS ?? process.env.BASE_TRADE_ESCROW_FACTORY_ADDRESS ?? ZERO) as Address,
  },
  143: {
    TRADE_ESCROW_FACTORY: (process.env.NEXT_PUBLIC_MONAD_TRADE_ESCROW_FACTORY_ADDRESS ?? process.env.MONAD_TRADE_ESCROW_FACTORY_ADDRESS ?? ZERO) as Address,
  },
};
