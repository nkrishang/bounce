'use client';

import { useQuery } from '@tanstack/react-query';
import { type Address } from '@escape/shared';
import { api } from '@/lib/api';

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as Address;

export function useWalletBalance(address: Address | undefined) {
  return useQuery({
    queryKey: ['walletBalance', address],
    queryFn: async () => {
      if (!address) throw new Error('No address');
      const response = await api.get<{ data: { balance: string } }>(
        `/tokens/${USDC_ADDRESS}/balance/${address}`
      );
      return response.data.balance;
    },
    enabled: !!address,
    refetchInterval: 30 * 1000,
  });
}
