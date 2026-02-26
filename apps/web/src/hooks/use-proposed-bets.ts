'use client';

import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { POLYMARKET_ADDRESSES, BounceAbi, assertBounceConfigured } from '@bounce/contracts';
import { type BetMetadata, type BetView, normalizeBet, BetStatus } from '@bounce/shared';
import { api } from '@/lib/api';

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(process.env.NEXT_PUBLIC_POLYGON_RPC_URL || ''),
});

export function useProposedBets() {
  return useQuery({
    queryKey: ['bets', 'proposed'],
    queryFn: async () => {
      assertBounceConfigured();
      const { data: allMetadata } = await api.get<{ data: BetMetadata[] }>('/bets');

      const betViews: BetView[] = await Promise.all(
        allMetadata.map(async (metadata) => {
          const raw = await publicClient.readContract({
            address: POLYMARKET_ADDRESSES.BOUNCE,
            abi: BounceAbi,
            functionName: 'getBet',
            args: [BigInt(metadata.betId)],
          });
          const bet = normalizeBet(raw as Record<string, unknown>);
          return { betId: metadata.betId, bet, metadata };
        }),
      );

      return betViews.filter((bv) => bv.bet.status === BetStatus.Proposed);
    },
    refetchInterval: 30_000,
  });
}
