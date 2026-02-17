'use client';

import { useQuery } from '@tanstack/react-query';
import { type TokenMeta, type Address, type SupportedChainId } from '@bounce/shared';
import { api } from '@/lib/api';

export function useTokenMeta(chainId: SupportedChainId, tokenAddress: Address | undefined) {
  return useQuery({
    queryKey: ['token', chainId, tokenAddress],
    queryFn: async () => {
      if (!tokenAddress) throw new Error('No token address');
      const response = await api.get<{ data: TokenMeta }>(`/tokens/${tokenAddress}?chainId=${chainId}`);
      return response.data;
    },
    enabled: !!tokenAddress,
    staleTime: 5 * 60 * 1000,
  });
}
