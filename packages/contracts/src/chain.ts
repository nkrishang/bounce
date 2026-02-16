import { polygon, base, type Chain } from 'viem/chains';

export type ChainId = 137 | 8453 | 143;

export const monad: Chain = {
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 9248132,
    },
  },
};

export { polygon, base };

export const SUPPORTED_CHAINS = [polygon, base, monad] as const;
export const SUPPORTED_CHAIN_IDS: readonly ChainId[] = [137, 8453, 143] as const;

export function getChain(chainId: ChainId): Chain {
  switch (chainId) {
    case 137: return polygon;
    case 8453: return base;
    case 143: return monad;
  }
}

export const CHAIN_NAMES: Record<ChainId, string> = {
  137: 'Polygon',
  8453: 'Base',
  143: 'Monad',
};

export const EXPLORER_URLS: Record<ChainId, string> = {
  137: 'https://polygonscan.com',
  8453: 'https://basescan.org',
  143: 'https://explorer.monad.xyz',
};
