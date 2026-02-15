'use client';

import { Loader2 } from 'lucide-react';
import { useTrades } from '@/hooks/use-trades';
import { TradeProposalCard } from './trade-proposal-card';

export function TradeProposalsCarousel() {
  const { data: trades, isLoading, error } = useTrades({ status: 'OPEN' });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !trades || trades.length === 0) {
    return null;
  }

  return (
    <div
      className="overflow-x-auto pb-4"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex gap-4" style={{ minWidth: 'min-content' }}>
        {trades.map((trade) => (
          <TradeProposalCard key={trade.escrow} trade={trade} />
        ))}
      </div>
    </div>
  );
}
