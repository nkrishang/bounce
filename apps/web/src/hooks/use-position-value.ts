'use client';

import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, type Address, formatUnits } from 'viem';
import { ERC20Abi, getChain } from '@thesis/contracts';
import { TOKENS_BY_CHAIN, type SupportedChainId } from '@thesis/shared';
import { api } from '@/lib/api';

const RPC_URLS: Record<number, string | undefined> = {
  137: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || undefined,
  8453: process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined,
  143: process.env.NEXT_PUBLIC_MONAD_RPC_URL || undefined,
};

interface IndicativePriceResponse {
  sellAmount: string;
  buyAmount: string;
  liquidityAvailable: boolean;
  pricePerToken?: string;
  derivedFromReference?: boolean;
}

export interface PositionValue {
  tokenBalance: bigint | null;
  tokenBalanceFormatted: string | null;
  currentValueUsdc: bigint | null;
  currentValueUsdcFormatted: string | null;
  buyPriceUsdc: bigint;
  buyPriceUsdcFormatted: string;
  pnlUsdc: bigint | null;
  pnlUsdcFormatted: string | null;
  pnlPercent: number | null;
  isProfit: boolean | null;
  balanceLoading: boolean;
  balanceError: boolean;
  priceLoading: boolean;
  priceError: boolean;
  noLiquidity: boolean;
}

export function usePositionValue(
  chainId: SupportedChainId,
  escrowAddress: Address | undefined,
  buyToken: Address | undefined,
  buyTokenDecimals: number = 18,
  totalSellIn: string | undefined
) {
  return useQuery({
    queryKey: ['positionValue', chainId, escrowAddress, buyToken, totalSellIn],
    queryFn: async (): Promise<PositionValue> => {
      const buyPriceUsdc = BigInt(totalSellIn || '0');
      
      const baseResult: PositionValue = {
        tokenBalance: null,
        tokenBalanceFormatted: null,
        currentValueUsdc: null,
        currentValueUsdcFormatted: null,
        buyPriceUsdc,
        buyPriceUsdcFormatted: formatUnits(buyPriceUsdc, 6),
        pnlUsdc: null,
        pnlUsdcFormatted: null,
        pnlPercent: null,
        isProfit: null,
        balanceLoading: false,
        balanceError: false,
        priceLoading: false,
        priceError: false,
        noLiquidity: false,
      };

      if (!escrowAddress || !buyToken) {
        return baseResult;
      }

      const rpcUrl = RPC_URLS[chainId] || undefined;
      const client = createPublicClient({
        chain: getChain(chainId),
        transport: http(rpcUrl),
      });

      let tokenBalance: bigint | null = null;
      let balanceError = false;

      try {
        tokenBalance = await client.readContract({
          address: buyToken,
          abi: ERC20Abi,
          functionName: 'balanceOf',
          args: [escrowAddress],
        }) as bigint;
      } catch (err) {
        console.error('[usePositionValue] Failed to fetch balance:', err);
        balanceError = true;
      }

      if (tokenBalance === null || tokenBalance === 0n) {
        return {
          ...baseResult,
          tokenBalance: tokenBalance ?? null,
          tokenBalanceFormatted: tokenBalance !== null ? formatUnits(tokenBalance, buyTokenDecimals) : null,
          balanceError,
        };
      }

      let currentValueUsdc: bigint | null = null;
      let pnlUsdc: bigint | null = null;
      let pnlPercent: number | null = null;
      let isProfit: boolean | null = null;
      let priceError = false;
      let noLiquidity = false;

      try {
        // Use the new indicative-price endpoint which handles small amounts via reference pricing
        const params = new URLSearchParams({
          chainId: chainId.toString(),
          sellToken: buyToken,
          buyToken: TOKENS_BY_CHAIN[chainId].USDC,
          sellAmount: tokenBalance.toString(),
          taker: escrowAddress, // Use actual escrow address, same as sell action
          tokenDecimals: buyTokenDecimals.toString(),
        });
        
        const priceResponse = await api.get<IndicativePriceResponse>(`/swap/indicative-price?${params.toString()}`);
        
        if (priceResponse?.liquidityAvailable && priceResponse.buyAmount) {
          currentValueUsdc = BigInt(priceResponse.buyAmount);
        } else {
          noLiquidity = true;
        }

        if (currentValueUsdc !== null) {
          pnlUsdc = currentValueUsdc - buyPriceUsdc;
          isProfit = pnlUsdc >= 0n;

          if (buyPriceUsdc > 0n) {
            pnlPercent = Number((pnlUsdc * 10000n) / buyPriceUsdc) / 100;
          }
        }
      } catch (err) {
        console.error('[usePositionValue] Price fetch failed:', err);
        priceError = true;
      }

      return {
        tokenBalance,
        tokenBalanceFormatted: formatUnits(tokenBalance, buyTokenDecimals),
        currentValueUsdc,
        currentValueUsdcFormatted: currentValueUsdc ? formatUnits(currentValueUsdc, 6) : null,
        buyPriceUsdc,
        buyPriceUsdcFormatted: formatUnits(buyPriceUsdc, 6),
        pnlUsdc,
        pnlUsdcFormatted: pnlUsdc !== null ? formatUnits(pnlUsdc < 0n ? -pnlUsdc : pnlUsdc, 6) : null,
        pnlPercent,
        isProfit,
        balanceLoading: false,
        balanceError,
        priceLoading: false,
        priceError,
        noLiquidity,
      };
    },
    enabled: !!escrowAddress && !!buyToken && !!totalSellIn && BigInt(totalSellIn || '0') > 0n,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}
