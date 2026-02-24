'use client';

import { useQuery } from '@tanstack/react-query';
import { type Address, createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { POLYMARKET_ADDRESSES, BounceAbi, assertBounceConfigured } from '@bounce/contracts';
import { type BetOnchain, type BetView, type BetMetadata, normalizeBet, validateConditionId } from '@bounce/shared';
import { api } from '@/lib/api';

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(process.env.NEXT_PUBLIC_POLYGON_RPC_URL || ''),
});

async function fetchBetOnchain(betId: number): Promise<BetOnchain> {
  assertBounceConfigured();
  const result = await publicClient.readContract({
    address: POLYMARKET_ADDRESSES.BOUNCE,
    abi: BounceAbi,
    functionName: 'getBet',
    args: [BigInt(betId)],
  });
  return normalizeBet(result as Record<string, unknown>);
}

async function fetchBetIds(address: Address): Promise<number[]> {
  const proposerCount = await publicClient.readContract({
    address: POLYMARKET_ADDRESSES.BOUNCE,
    abi: BounceAbi,
    functionName: 'getBetsByProposerCount',
    args: [address],
  }) as bigint;

  const funderCount = await publicClient.readContract({
    address: POLYMARKET_ADDRESSES.BOUNCE,
    abi: BounceAbi,
    functionName: 'getBetsByFunderCount',
    args: [address],
  }) as bigint;

  const betIdSet = new Set<number>();

  if (proposerCount > 0n) {
    const proposerBetIds = await publicClient.readContract({
      address: POLYMARKET_ADDRESSES.BOUNCE,
      abi: BounceAbi,
      functionName: 'getBetsByProposer',
      args: [address, 0n, proposerCount],
    }) as bigint[];
    proposerBetIds.forEach((id) => betIdSet.add(Number(id)));
  }

  if (funderCount > 0n) {
    const funderBetIds = await publicClient.readContract({
      address: POLYMARKET_ADDRESSES.BOUNCE,
      abi: BounceAbi,
      functionName: 'getBetsByFunder',
      args: [address, 0n, funderCount],
    }) as bigint[];
    funderBetIds.forEach((id) => betIdSet.add(Number(id)));
  }

  return Array.from(betIdSet).sort((a, b) => b - a);
}

async function fetchBetMetadata(betId: number): Promise<BetMetadata | undefined> {
  try {
    const response = await api.get<{ data: BetMetadata }>(`/bets/${betId}/metadata`);
    return response.data;
  } catch {
    return undefined;
  }
}

async function fetchBetView(betId: number): Promise<BetView> {
  const [bet, metadata] = await Promise.all([
    fetchBetOnchain(betId),
    fetchBetMetadata(betId),
  ]);
  return { betId, bet, metadata };
}

export function useMyBets(address: Address | undefined) {
  return useQuery({
    queryKey: ['my-bets', address],
    queryFn: async () => {
      if (!address) throw new Error('No address');
      const betIds = await fetchBetIds(address);
      const betViews = await Promise.all(betIds.map(fetchBetView));
      return betViews;
    },
    enabled: !!address,
    refetchInterval: 30_000,
  });
}

export function useBet(betId: number | undefined) {
  return useQuery({
    queryKey: ['bet', betId],
    queryFn: async () => {
      if (betId === undefined) throw new Error('No betId');
      return fetchBetView(betId);
    },
    enabled: betId !== undefined,
  });
}

export function useBetsByCondition(conditionId: string | undefined) {
  return useQuery({
    queryKey: ['bets-by-condition', conditionId],
    queryFn: async () => {
      if (!conditionId) throw new Error('No conditionId');
      const conditionIdHex = validateConditionId(conditionId);

      const count = await publicClient.readContract({
        address: POLYMARKET_ADDRESSES.BOUNCE,
        abi: BounceAbi,
        functionName: 'getBetsByConditionIdCount',
        args: [conditionIdHex],
      }) as bigint;

      if (count === 0n) return [];

      const betIds = await publicClient.readContract({
        address: POLYMARKET_ADDRESSES.BOUNCE,
        abi: BounceAbi,
        functionName: 'getBetsByConditionId',
        args: [conditionIdHex, 0n, count],
      }) as bigint[];

      return Promise.all(betIds.map((id) => fetchBetView(Number(id))));
    },
    enabled: !!conditionId,
    refetchInterval: 30_000,
  });
}
