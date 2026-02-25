'use client';

import { useQuery } from '@tanstack/react-query';
import { type Address } from '@bounce/shared';
import { TOKENS_BY_CHAIN, type SupportedChainId } from '@bounce/shared';
import { api } from '@/lib/api';

const CHAIN_IDS: SupportedChainId[] = [137];

export type ChainBalances = Record<SupportedChainId, { usdc: string; native: string }>;

export function useWalletBalances(address: Address | undefined) {
  return useQuery({
    queryKey: ['walletBalances', address],
    queryFn: async (): Promise<ChainBalances> => {
      if (!address) throw new Error('No address');

      const entries = await Promise.all(
        CHAIN_IDS.map(async (chainId) => {
          try {
            const usdc = TOKENS_BY_CHAIN[chainId].USDC;
            const [usdcRes, nativeRes] = await Promise.all([
              api.get<{ data: { balance: string } }>(
                `/tokens/${usdc}/balance/${address}?chainId=${chainId}`
              ),
              api.get<{ data: { balance: string } }>(
                `/tokens/native/balance/${address}?chainId=${chainId}`
              ),
            ]);
            return [chainId, { usdc: usdcRes.data.balance, native: nativeRes.data.balance }] as const;
          } catch {
            return [chainId, { usdc: '0', native: '0' }] as const;
          }
        })
      );

      return Object.fromEntries(entries) as ChainBalances;
    },
    enabled: !!address,
    refetchInterval: 30 * 1000,
  });
}
