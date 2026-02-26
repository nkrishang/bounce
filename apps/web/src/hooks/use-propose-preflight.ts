'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { polygon } from 'viem/chains';
import {
  deriveSafeAddress,
  isSafeDeployed,
  isBounceModuleEnabled,
  isBounceGuardInstalled,
} from '@/lib/polymarket-safe';
import { useWalletBalances } from '@/hooks/use-wallet';

const MIN_GAS_POL = 0.02;

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(process.env.NEXT_PUBLIC_POLYGON_RPC_URL || ''),
});

interface SafeStatus {
  deployed: boolean;
  moduleEnabled: boolean;
  guardInstalled: boolean;
}

export interface PreflightResult {
  usdcBalance: number;
  nativeBalance: number;
  hasEnoughUsdc: boolean;
  hasEnoughGas: boolean;
  safeStatus: SafeStatus | null;
  safeReady: boolean;
  safeTxsNeeded: number;
  totalSteps: number;
  isLoading: boolean;
}

export function useProposePreflight(
  address: Address | undefined,
  stakeAmount: number,
): PreflightResult {
  const { data: balances, isLoading: balancesLoading } = useWalletBalances(address);

  const { data: safeStatus, isLoading: safeLoading } = useQuery({
    queryKey: ['safe-status', address],
    queryFn: async (): Promise<SafeStatus> => {
      if (!address) throw new Error('No address');
      const safeAddress = deriveSafeAddress(address);
      const [deployed, moduleEnabled, guardInstalled] = await Promise.all([
        isSafeDeployed(publicClient, safeAddress),
        isBounceModuleEnabled(publicClient, safeAddress),
        isBounceGuardInstalled(publicClient, safeAddress),
      ]);
      return { deployed, moduleEnabled, guardInstalled };
    },
    enabled: !!address,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const chainBalances = balances?.[137];
    const usdcBalance = chainBalances
      ? parseFloat(formatUnits(BigInt(chainBalances.usdc), 6))
      : 0;
    const nativeBalance = chainBalances
      ? parseFloat(formatUnits(BigInt(chainBalances.native), 18))
      : 0;

    const hasEnoughUsdc = usdcBalance >= stakeAmount;
    const hasEnoughGas = nativeBalance >= MIN_GAS_POL;

    const safeReady = safeStatus
      ? safeStatus.deployed && safeStatus.moduleEnabled && safeStatus.guardInstalled
      : false;

    const safeTxsNeeded = safeStatus
      ? (!safeStatus.deployed ? 1 : 0) +
        (!safeStatus.moduleEnabled ? 1 : 0) +
        (!safeStatus.guardInstalled ? 1 : 0)
      : 0;

    // Total steps: safe setup txs + approve + propose + save metadata
    const totalSteps = safeTxsNeeded + 1 + 1 + 1;

    return {
      usdcBalance,
      nativeBalance,
      hasEnoughUsdc,
      hasEnoughGas,
      safeStatus: safeStatus ?? null,
      safeReady,
      safeTxsNeeded,
      totalSteps,
      isLoading: balancesLoading || safeLoading,
    };
  }, [balances, safeStatus, stakeAmount, balancesLoading, safeLoading]);
}
