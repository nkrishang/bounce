import type { Address, SupportedChainId } from './types';

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

export const DEFAULT_SLIPPAGE_BPS = 100; // 1%

export const PROPOSER_PROFIT_SHARE_BPS = 3000;
export const FUNDER_PROFIT_SHARE_BPS = 7000;

export const PROPOSER_CONTRIBUTION_PERCENT = 20;
export const FUNDER_CONTRIBUTION_PERCENT = 80;

export const TOKENS_BY_CHAIN: Record<SupportedChainId, {
  USDC: Address;
  WRAPPED_NATIVE: Address;
}> = {
  137: {
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as Address,
    WRAPPED_NATIVE: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' as Address, // WMATIC
  },
  8453: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
    WRAPPED_NATIVE: '0x4200000000000000000000000000000000000006' as Address, // WETH on Base
  },
  143: {
    USDC: '0x0000000000000000000000000000000000000000' as Address,
    WRAPPED_NATIVE: '0x0000000000000000000000000000000000000000' as Address, // WMON placeholder
  },
} as const;

export function getUsdcAddress(chainId: SupportedChainId): Address {
  return TOKENS_BY_CHAIN[chainId].USDC;
}

export function getWrappedNativeAddress(chainId: SupportedChainId): Address {
  return TOKENS_BY_CHAIN[chainId].WRAPPED_NATIVE;
}

// Keep backward compat alias — some old code may still reference this
export const POLYGON_TOKENS = TOKENS_BY_CHAIN[137];
