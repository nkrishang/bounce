'use client';

import { useMemo } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useWalletBalances } from '@/hooks/use-wallet';
import type { Address } from 'viem';

const MIN_GAS_WEI = parseUnits('0.02', 18);

export interface FundPreflightResult {
  usdcBalance: number;
  nativeBalance: number;
  hasEnoughUsdc: boolean;
  hasEnoughGas: boolean;
  isLoading: boolean;
}

export function useFundPreflight(
  address: Address | undefined,
  requiredUsdc: bigint,
): FundPreflightResult {
  const { data: balances, isLoading: balancesLoading } = useWalletBalances(address);

  return useMemo(() => {
    const chainBalances = balances?.[137];
    const usdcRaw = chainBalances ? BigInt(chainBalances.usdc) : 0n;
    const nativeRaw = chainBalances ? BigInt(chainBalances.native) : 0n;

    const usdcBalance = parseFloat(formatUnits(usdcRaw, 6));
    const nativeBalance = parseFloat(formatUnits(nativeRaw, 18));

    const hasEnoughUsdc = usdcRaw >= requiredUsdc;
    const hasEnoughGas = nativeRaw >= MIN_GAS_WEI;

    return {
      usdcBalance,
      nativeBalance,
      hasEnoughUsdc,
      hasEnoughGas,
      isLoading: balancesLoading,
    };
  }, [balances, requiredUsdc, balancesLoading]);
}
