'use client';

import { useQuery } from '@tanstack/react-query';
import { type TradeView, type TradeStatus, type Address } from '@bounce/shared';
import { api } from '@/lib/api';

interface UseTradesOptions {
  status?: TradeStatus;
}

export function useTrades(options?: UseTradesOptions) {
  return useQuery({
    queryKey: ['trades', options?.status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.status) {
        params.set('status', options.status);
      }
      const response = await api.get<{ data: TradeView[] }>(`/trades?${params.toString()}`);
      return response.data;
    },
  });
}

const SUPPORTED_CHAIN_IDS = [137, 8453, 143] as const;

export function useTrade(escrowAddress: string | undefined) {
  return useQuery({
    queryKey: ['trade', escrowAddress],
    queryFn: async () => {
      if (!escrowAddress) throw new Error('No escrow address');
      const results = await Promise.allSettled(
        SUPPORTED_CHAIN_IDS.map((chainId) =>
          api.get<{ data: TradeView }>(`/trades/${escrowAddress}?chainId=${chainId}`)
        )
      );
      for (const result of results) {
        if (result.status === 'fulfilled') return result.value.data;
      }
      throw new Error('Trade not found on any chain');
    },
    enabled: !!escrowAddress,
  });
}

export function useUserTrades(userAddress: Address | undefined) {
  return useQuery({
    queryKey: ['userTrades', userAddress],
    queryFn: async () => {
      if (!userAddress) throw new Error('No user address');
      const response = await api.get<{
        data: { asProposer: TradeView[]; asFunder: TradeView[] };
      }>(`/trades/user/${userAddress}`);
      return response.data;
    },
    enabled: !!userAddress,
  });
}
