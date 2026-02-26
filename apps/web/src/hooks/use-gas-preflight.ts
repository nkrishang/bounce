'use client';

import { useMemo } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useWalletBalances } from '@/hooks/use-wallet';
import type { Address } from 'viem';

const MIN_GAS_WEI = parseUnits('0.02', 18);

export interface GasPreflightResult {
  nativeBalance: number;
  hasEnoughGas: boolean;
  isLoading: boolean;
}

export function useGasPreflight(address: Address | undefined): GasPreflightResult {
  const { data: balances, isLoading: balancesLoading } = useWalletBalances(address);

  return useMemo(() => {
    const chainBalances = balances?.[137];
    const nativeRaw = chainBalances ? BigInt(chainBalances.native) : 0n;
    const nativeBalance = parseFloat(formatUnits(nativeRaw, 18));
    const hasEnoughGas = nativeRaw >= MIN_GAS_WEI;

    return {
      nativeBalance,
      hasEnoughGas,
      isLoading: balancesLoading,
    };
  }, [balances, balancesLoading]);
}
