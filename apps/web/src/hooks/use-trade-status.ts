'use client';

import { useQuery } from '@tanstack/react-query';
import type { BetTradeState } from '@bounce/shared';
import { api } from '@/lib/api';

export function useTradeStatus(betId: number | undefined) {
  return useQuery({
    queryKey: ['trade-status', betId],
    queryFn: async () => {
      const response = await api.get<{ data: BetTradeState | null }>(`/bets/${betId}/trade-status`);
      return response.data;
    },
    enabled: betId !== undefined,
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}
