'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Address } from 'viem';

export interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  networkId: number;

  logoURI?: string;
  imageThumbUrl?: string;
  imageSmallUrl?: string;
  imageLargeUrl?: string;

  socialLinks?: {
    twitter?: string | null;
    telegram?: string | null;
    website?: string | null;
    discord?: string | null;
  } | null;

  priceUSD?: number | null;
  change5m?: number | null;
  change1h?: number | null;
  change4h?: number | null;
  change24h?: number | null;

  volume24h?: number | null;
  marketCap?: number | null;
  holders?: number | null;
  liquidity?: number | null;

  priceUsd?: number | null;
  priceChangeH24?: number | null;
}

interface TrendingResponse {
  data: Array<{
    priceUSD: string | null;
    change5m: string | null;
    change1: string | null;
    change4: string | null;
    change24: string | null;
    volume24: string | null;
    marketCap: string | null;
    holders: number | null;
    liquidity: string | null;
    token: {
      address: string;
      name: string;
      symbol: string;
      networkId: number;
      imageThumbUrl: string | null;
      socialLinks: {
        twitter: string | null;
        telegram: string | null;
        website: string | null;
        discord: string | null;
      } | null;
      info: {
        imageThumbUrl: string | null;
        imageSmallUrl: string | null;
        imageLargeUrl: string | null;
      } | null;
    };
  }>;
}

function parseNum(val: string | null | undefined): number | null {
  if (val == null) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

export function useTokenList() {
  return useQuery({
    queryKey: ['trendingTokens'],
    queryFn: async (): Promise<TokenInfo[]> => {
      const res = await api.get<TrendingResponse>('/tokens/trending');
      return res.data.map((t) => {
        const priceUSD = parseNum(t.priceUSD);
        const change24h = parseNum(t.change24);
        return {
          address: t.token.address as Address,
          name: t.token.name,
          symbol: t.token.symbol,
          networkId: t.token.networkId,
          logoURI:
            t.token.info?.imageSmallUrl ??
            t.token.info?.imageThumbUrl ??
            t.token.imageThumbUrl ??
            undefined,
          imageThumbUrl:
            t.token.info?.imageThumbUrl ?? t.token.imageThumbUrl ?? undefined,
          imageSmallUrl: t.token.info?.imageSmallUrl ?? undefined,
          imageLargeUrl: t.token.info?.imageLargeUrl ?? undefined,
          socialLinks: t.token.socialLinks,
          priceUSD,
          change5m: parseNum(t.change5m),
          change1h: parseNum(t.change1),
          change4h: parseNum(t.change4),
          change24h,
          volume24h: parseNum(t.volume24),
          marketCap: parseNum(t.marketCap),
          holders: t.holders,
          liquidity: parseNum(t.liquidity),
          priceUsd: priceUSD,
          priceChangeH24: change24h,
        };
      });
    },
    staleTime: 10 * 60 * 1000,
  });
}
