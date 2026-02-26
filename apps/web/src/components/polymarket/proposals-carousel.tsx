'use client';

import { Loader2 } from 'lucide-react';
import { useProposedBets } from '@/hooks/use-proposed-bets';
import { ProposalCard } from './proposal-card';

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
