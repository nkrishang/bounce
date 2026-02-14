'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Address } from 'viem';

export interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  logoURI?: string;
  priceUsd?: number | null;
  priceChangeH24?: number | null;
  volume24h?: number | null;
  marketCap?: number | null;
}

interface TrendingResponse {
  data: Array<{
    address: string;
    name: string;
    symbol: string;
    logoURI: string | null;
    priceUsd: number | null;
    priceChangeH24: number | null;
    volume24h: number | null;
    marketCap: number | null;
  }>;
}

export function useTokenList() {
  return useQuery({
    queryKey: ['trendingTokens'],
    queryFn: async (): Promise<TokenInfo[]> => {
      const res = await api.get<TrendingResponse>('/tokens/trending');
      return res.data.map((t) => ({
        address: t.address as Address,
        name: t.name,
        symbol: t.symbol,
        logoURI: t.logoURI ?? undefined,
        priceUsd: t.priceUsd,
        priceChangeH24: t.priceChangeH24,
        volume24h: t.volume24h,
        marketCap: t.marketCap,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
