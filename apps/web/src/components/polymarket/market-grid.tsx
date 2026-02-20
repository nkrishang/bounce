'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { usePolymarketEvents } from '@/hooks/use-polymarket-markets';
import type { PolymarketEvent, PolymarketMarket } from '@bounce/shared';
import { MarketCard } from './market-card';

interface MarketGridProps {
  onPropose: (event: PolymarketEvent, market: PolymarketMarket, tokenId: string, outcome: string, price: number) => void;
}

export function MarketGrid({ onPropose }: MarketGridProps) {
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const { data: events, isLoading, error } = usePolymarketEvents({ limit, offset, order: 'volume24hr' });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Failed to load Polymarket events</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{error.message}</p>
      </div>
    );
  }

  const activeEvents = events?.filter((event) => event.active && !event.closed);

  if (!activeEvents || activeEvents.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">No active events found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeEvents.map((event) => (
          <MarketCard key={event.id} event={event} onPropose={onPropose} />
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-3 mt-8">
        {offset > 0 && (
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-dark-border hover:border-primary/50 text-muted-foreground hover:text-white transition-colors"
          >
            Previous
          </button>
        )}
        {events.length >= limit && (
          <button
            onClick={() => setOffset(offset + limit)}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-dark-border hover:border-primary/50 text-muted-foreground hover:text-white transition-colors"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
