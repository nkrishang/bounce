'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface OrderBookLevel {
  price: string;
  size: string;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface LiquidityCheckResult {
  canFill: boolean;
  estimatedAvgPrice: number;
  estimatedShares: number;
  priceImpact: number;
  availableLiquidity: number;
  isLoading: boolean;
  isError: boolean;
}

function estimateFill(asks: OrderBookLevel[], amountUsdc: number): {
  canFill: boolean;
  avgPrice: number;
  totalShares: number;
  priceImpact: number;
  availableLiquidity: number;
} {
  if (asks.length === 0) {
    return { canFill: false, avgPrice: 0, totalShares: 0, priceImpact: 0, availableLiquidity: 0 };
  }

  // Sort asks by price ascending (cheapest first)
  const sorted = [...asks].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  const bestAsk = parseFloat(sorted[0]!.price);

  let remaining = amountUsdc;
  let totalCost = 0;
  let totalShares = 0;
  let availableLiquidity = 0;

  for (const level of sorted) {
    const price = parseFloat(level.price);
    const size = parseFloat(level.size);
    const levelCost = price * size;
    availableLiquidity += levelCost;

    if (remaining <= 0) continue;

    if (levelCost <= remaining) {
      totalCost += levelCost;
      totalShares += size;
      remaining -= levelCost;
    } else {
      const sharesBuyable = remaining / price;
      totalCost += remaining;
      totalShares += sharesBuyable;
      remaining = 0;
    }
  }

  const canFill = remaining <= 0;
  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
  const priceImpact = bestAsk > 0 && avgPrice > 0 ? (avgPrice - bestAsk) / bestAsk : 0;

  return { canFill, avgPrice, totalShares, priceImpact, availableLiquidity };
}

export function useLiquidityCheck(
  tokenId: string | undefined,
  amountUsdc: number,
): LiquidityCheckResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['clob-book', tokenId],
    queryFn: async () => {
      const response = await api.get<{ data: OrderBook }>(`/polymarket/clob/book?token_id=${tokenId}`);
      return response.data;
    },
    enabled: !!tokenId && amountUsdc > 0,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  if (!tokenId || amountUsdc <= 0 || isLoading || isError || !data) {
    return {
      canFill: false,
      estimatedAvgPrice: 0,
      estimatedShares: 0,
      priceImpact: 0,
      availableLiquidity: 0,
      isLoading: !!tokenId && isLoading,
      isError,
    };
  }

  const fill = estimateFill(data.asks || [], amountUsdc);

  return {
    canFill: fill.canFill,
    estimatedAvgPrice: fill.avgPrice,
    estimatedShares: fill.totalShares,
    priceImpact: fill.priceImpact,
    availableLiquidity: fill.availableLiquidity,
    isLoading: false,
    isError: false,
  };
}
