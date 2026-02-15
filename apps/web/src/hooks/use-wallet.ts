'use client';

import { useQuery } from '@tanstack/react-query';
import { type Address } from '@thesis/shared';
import { TOKENS_BY_CHAIN, type SupportedChainId } from '@thesis/shared';
import { api } from '@/lib/api';

const CHAIN_IDS: SupportedChainId[] = [137, 8453, 143];

export type ChainBalances = Record<SupportedChainId, string>;

export function useWalletBalances(address: Address | undefined) {
  return useQuery({
    queryKey: ['walletBalances', address],
    queryFn: async (): Promise<ChainBalances> => {
      if (!address) throw new Error('No address');

      const entries = await Promise.all(
        CHAIN_IDS.map(async (chainId) => {
          try {
            const usdc = TOKENS_BY_CHAIN[chainId].USDC;
            const response = await api.get<{ data: { balance: string } }>(
              `/tokens/${usdc}/balance/${address}?chainId=${chainId}`
            );
            return [chainId, response.data.balance] as const;
          } catch {
            return [chainId, '0'] as const;
          }
        })
      );

      return Object.fromEntries(entries) as ChainBalances;
    },
    enabled: !!address,
    refetchInterval: 30 * 1000,
  });
}
