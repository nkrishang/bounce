'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { PolymarketEvent, PolymarketMarket } from '@bounce/shared';
import { MarketCard } from './market-card';

interface MarketGridProps {
  onPropose: (event: PolymarketEvent, market: PolymarketMarket, tokenId: string, outcome: string, price: number) => void;
}

const PAGE_SIZE = 20;

function fetchPolymarketPage(offset: number) {
  const params = new URLSearchParams();
  params.set('limit', PAGE_SIZE.toString());
  params.set('offset', offset.toString());
  params.set('order', 'volume24hr');
  return api.get<{ data: PolymarketEvent[] }>(`/polymarket/events?${params.toString()}`).then((r) => r.data);
}

export function MarketGrid({ onPropose }: MarketGridProps) {
  const [pages, setPages] = useState(1);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const queries = useMemo(
    () =>
      Array.from({ length: pages }, (_, i) => ({
        queryKey: ['polymarket-events', PAGE_SIZE, i * PAGE_SIZE, 'volume24hr'],
        queryFn: () => fetchPolymarketPage(i * PAGE_SIZE),
        staleTime: 60 * 1000,
      })),
    [pages]
  );

  const results = useQueries({ queries });

  const firstLoading = results[0]?.isLoading;
  const lastResult = results[results.length - 1];
  const lastLoading = lastResult?.isLoading;
  const lastHasMore = lastResult?.data && lastResult.data.length >= PAGE_SIZE;

  // Infinite scroll
  useEffect(() => {
    if (!lastHasMore || lastLoading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPages((p) => p + 1);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [lastHasMore, lastLoading]);

  if (firstLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Collect all active events across pages, deduplicating by id
  const seenIds = new Set<string>();
  const allActiveEvents: PolymarketEvent[] = [];
  let hasError = false;
  let errorMessage = '';

  for (const result of results) {
    if (result.error) {
      hasError = true;
      errorMessage = (result.error as Error).message;
      break;
    }
    if (result.data) {
      for (const event of result.data) {
        if (event.active && !event.closed && !seenIds.has(event.id)) {
          seenIds.add(event.id);
          allActiveEvents.push(event);
        }
      }
    }
  }

  if (hasError && allActiveEvents.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Failed to load Polymarket events</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{errorMessage}</p>
      </div>
    );
  }

  if (allActiveEvents.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">No active events found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allActiveEvents.map((event) => (
          <MarketCard key={event.id} event={event} onPropose={onPropose} />
        ))}
      </div>

      {lastHasMore && <div ref={sentinelRef} className="h-1" />}

      {lastLoading && <LoadingPulse />}
    </div>
  );
}

function LoadingPulse() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="relative flex items-center justify-center">
        <span className="absolute w-12 h-12 rounded-full border border-purple-500/30 animate-ping" />
        <span
          className="absolute w-16 h-16 rounded-full border border-purple-500/15"
          style={{ animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite 0.3s' }}
        />
        <span className="relative w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
      </div>
      <p className="text-xs text-muted-foreground/60 animate-pulse">Loading markets…</p>
    </div>
  );
}
