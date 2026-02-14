'use client';

import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

export interface TokenInfo {
  chainId: number;
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface TokenList {
  name: string;
  tokens: TokenInfo[];
  version: {
    major: number;
    minor: number;
    patch: number;
  };
}

const TOKEN_LIST_URL =
  'https://tokens.coingecko.com/polygon-pos/all.json';

export function useTokenList() {
  return useQuery({
    queryKey: ['tokenList'],
    queryFn: async (): Promise<TokenInfo[]> => {
      const response = await fetch(TOKEN_LIST_URL);
      if (!response.ok) throw new Error('Failed to fetch token list');
      const data: TokenList = await response.json();
      return data.tokens;
    },
    staleTime: 60 * 60 * 1000,
  });
}
