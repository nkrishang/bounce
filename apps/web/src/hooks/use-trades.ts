'use client';

import { useQuery } from '@tanstack/react-query';
import { type TradeView, type TradeStatus, type Address } from '@escape/shared';
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

export function useTrade(escrowAddress: string | undefined) {
  return useQuery({
    queryKey: ['trade', escrowAddress],
    queryFn: async () => {
      if (!escrowAddress) throw new Error('No escrow address');
      const response = await api.get<{ data: TradeView }>(`/trades/${escrowAddress}`);
      return response.data;
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
