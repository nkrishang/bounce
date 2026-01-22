'use client';

import { useQuery } from '@tanstack/react-query';
import { type TokenMeta, type Address } from '@thesis/shared';
import { api } from '@/lib/api';

export function useTokenMeta(tokenAddress: Address | undefined) {
  return useQuery({
    queryKey: ['token', tokenAddress],
    queryFn: async () => {
      if (!tokenAddress) throw new Error('No token address');
      const response = await api.get<{ data: TokenMeta }>(`/tokens/${tokenAddress}`);
      return response.data;
    },
    enabled: !!tokenAddress,
    staleTime: 5 * 60 * 1000,
  });
}
