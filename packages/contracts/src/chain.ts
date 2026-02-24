import { polygon, type Chain } from 'viem/chains';

export type ChainId = 137;

export { polygon };

export const SUPPORTED_CHAINS = [polygon] as const;
export const SUPPORTED_CHAIN_IDS: readonly ChainId[] = [137] as const;

export function getChain(chainId: ChainId): Chain {
  switch (chainId) {
    case 137: return polygon;
  }
}

export const CHAIN_NAMES: Record<ChainId, string> = {
  137: 'Polygon',
};

export const EXPLORER_URLS: Record<ChainId, string> = {
  137: 'https://polygonscan.com',
};
