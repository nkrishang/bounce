import type { Address } from 'viem';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Throws if the BOUNCE address has not been set (still zero address).
 * Call at the top of any hook or function that interacts with the Bounce contract.
 */
export function assertBounceConfigured(): void {
  if (POLYMARKET_ADDRESSES.BOUNCE === ZERO_ADDRESS) {
    throw new Error(
      'Bounce contract address is not configured (still zero address). ' +
      'Set POLYMARKET_ADDRESSES.BOUNCE to the deployed proxy address before using the app.',
    );
  }
}

export const POLYMARKET_ADDRESSES = {
  POLYMARKET_SAFE_FACTORY: '0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b' as Address,
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Address,
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' as Address,
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a' as Address,
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296' as Address,
  CONDITIONAL_TOKENS: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045' as Address,
  BOUNCE: '0x0000000000000000000000000000000000000000' as Address,
  SAFE_INIT_CODE_HASH: '0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf',
} as const;
