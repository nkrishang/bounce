'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, formatUnits, parseUnits, type Address } from 'viem';
import { polygon } from 'viem/chains';
import {
  deriveSafeAddress,
  isSafeDeployed,
  isBounceModuleEnabled,
  isBounceGuardInstalled,
} from '@/lib/polymarket-safe';
import { useWalletBalances } from '@/hooks/use-wallet';

const MIN_GAS_WEI = parseUnits('0.02', 18);

const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL;
const publicClient = rpcUrl
  ? createPublicClient({ chain: polygon, transport: http(rpcUrl) })
  : null;

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
      if (!publicClient) throw new Error('Missing NEXT_PUBLIC_POLYGON_RPC_URL');
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
    const usdcRaw = chainBalances ? BigInt(chainBalances.usdc) : 0n;
    const nativeRaw = chainBalances ? BigInt(chainBalances.native) : 0n;

    const usdcBalance = parseFloat(formatUnits(usdcRaw, 6));
    const nativeBalance = parseFloat(formatUnits(nativeRaw, 18));

    const stakeWei = parseUnits(String(Math.max(0, stakeAmount)), 6);
    const hasEnoughUsdc = usdcRaw >= stakeWei;
    const hasEnoughGas = nativeRaw >= MIN_GAS_WEI;

    const safeReady = safeStatus
      ? safeStatus.deployed && safeStatus.moduleEnabled && safeStatus.guardInstalled
      : false;

    const safeTxsNeeded = safeStatus
      ? (!safeStatus.deployed ? 1 : 0) +
        (!safeStatus.moduleEnabled ? 1 : 0) +
        (!safeStatus.guardInstalled ? 1 : 0)
      : 0;

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
