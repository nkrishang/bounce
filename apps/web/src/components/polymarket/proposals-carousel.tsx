'use client';

import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { POLYMARKET_ADDRESSES, BounceAbi, assertBounceConfigured } from '@bounce/contracts';
import { type BetMetadata, type BetView, type BetOnchain, normalizeBet } from '@bounce/shared';
import { BetStatus } from '@bounce/shared';
import { api } from '@/lib/api';
import { ProposalCard } from './proposal-card';

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(process.env.NEXT_PUBLIC_POLYGON_RPC_URL || ''),
});

function useProposedBets() {
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

export function ProposalsCarousel() {
  const { data: betViews, isLoading, error } = useProposedBets();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !betViews || betViews.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Active Bet Proposals
          </h2>
          <span
            className="inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
            style={{
              color: '#61A6FB',
              borderColor: 'rgba(97, 166, 251, 0.3)',
              background: 'rgba(97, 166, 251, 0.08)',
            }}
          >
            For Backers
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Fund proposed Polymarket bets. You cover 80%, Believer covers 20% first-loss.
        </p>
      </div>

      <div
        className="relative -mx-4 sm:-mx-6 lg:-mx-8"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)',
        }}
      >
        <div
          className="overflow-x-auto pb-3 px-4 sm:px-6 lg:px-8 carousel-scroll"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex gap-4" style={{ minWidth: 'min-content' }}>
            {betViews.map((betView) => (
              <ProposalCard key={betView.betId} betView={betView} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
