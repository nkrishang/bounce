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
    <div>
      {/* Section header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Active Opportunities
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
          Fund proposed trades. You cover 80%, Believer covers 20% first-loss.
        </p>
      </div>

      {/* Cards horizontal scroll */}
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
            {trades.map((trade) => (
              <TradeProposalCard key={trade.escrow} trade={trade} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
