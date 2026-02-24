import type { Address, SupportedChainId } from './types.js';

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

export const DEFAULT_SLIPPAGE_BPS = 100; // 1%

export const PROPOSER_PROFIT_SHARE_BPS = 6000;
export const FUNDER_PROFIT_SHARE_BPS = 4000;

export const PROPOSER_CONTRIBUTION_PERCENT = 20;
export const FUNDER_CONTRIBUTION_PERCENT = 80;

export const TOKENS_BY_CHAIN: Record<SupportedChainId, {
  USDC: Address;
  WRAPPED_NATIVE: Address;
}> = {
  137: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Address,
    WRAPPED_NATIVE: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' as Address,
  },
} as const;
