'use client';

import { useQuery } from '@tanstack/react-query';
import type { PolymarketEvent } from '@bounce/shared';
import { api } from '@/lib/api';

interface UsePolymarketEventsOptions {
  limit?: number;
  offset?: number;
  order?: string;
}

export function usePolymarketEvents(options?: UsePolymarketEventsOptions) {
  return useQuery({
    queryKey: ['polymarket-events', options?.limit, options?.offset, options?.order],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());
      if (options?.order) params.set('order', options.order);
      
      const response = await api.get<{ data: PolymarketEvent[] }>(
        `/polymarket/events?${params.toString()}`
      );
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function usePolymarketEvent(slug: string | undefined) {
  return useQuery({
    queryKey: ['polymarket-event', slug],
    queryFn: async () => {
      if (!slug) throw new Error('No slug');
      const response = await api.get<{ data: PolymarketEvent }>(`/polymarket/events/${slug}`);
      return response.data;
    },
    enabled: !!slug,
  });
}
