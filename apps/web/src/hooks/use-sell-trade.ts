'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address } from 'viem';
import { TradeEscrowAbi, type ChainId } from '@bounce/contracts';
import type { SwapQuote } from '@bounce/shared';
import { api } from '@/lib/api';
import { patchTradeInCache } from '@/lib/trade-cache';
import { sendAndConfirm, createClients, getWalletAddress } from '@/lib/transaction';

type Step = 'idle' | 'fetching-quote' | 'sell' | 'confirming' | 'success';

interface SellTradeParams {
  chainId: ChainId;
  escrowAddress: Address;
  buyToken: Address;
  sellToken: Address;
  buyTokenAmount: bigint;
}

async function getSwapQuote(chainId: number, params: {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  taker: Address;
  slippageBps?: number;
}): Promise<SwapQuote> {
  const queryParams = new URLSearchParams({
    chainId: chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.taker,
  });

  if (params.slippageBps) {
    queryParams.append('slippageBps', params.slippageBps.toString());
  }

  return api.get<SwapQuote>(`/swap/quote?${queryParams.toString()}`);
}

export function useSellTrade() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setIsLoading(false);
    setError(null);
  }, []);

  const sellTrade = useCallback(
    async (params: SellTradeParams) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(params.chainId);

        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient, chain } = createClients(params.chainId, provider);

        const address = await getWalletAddress(walletClient);

        // Step 1: Get swap quote (selling buyToken back to sellToken/USDC)
        setStep('fetching-quote');

        const quote = await getSwapQuote(params.chainId, {
          sellToken: params.buyToken,
          buyToken: params.sellToken,
          sellAmount: params.buyTokenAmount.toString(),
          taker: params.escrowAddress,
          slippageBps: 100,
        });

        console.log('0x Quote received for sell:', {
          sellAmount: quote.sellAmount,
          buyAmount: quote.buyAmount,
          minBuyAmount: quote.minBuyAmount,
          route: quote.route?.fills?.map(f => f.source).join(' -> ') ?? 'unknown',
        });

        // Step 2: Execute sell with 0x quote
        setStep('sell');

        setStep('confirming');
        const { hash: sellHash } = await sendAndConfirm(
          publicClient,
          () =>
            walletClient.writeContract({
              chain,
              address: params.escrowAddress,
              abi: TradeEscrowAbi,
              functionName: 'sell',
              args: [
                BigInt(quote.minBuyAmount),
                quote.swapTarget,
                quote.swapCallData,
              ],
              account: address,
              gas: 2_000_000n,
            }),
        );

        console.log('Sell tx confirmed:', sellHash);

        await api.post('/trades/refresh', {
          chainId: params.chainId,
          escrowAddress: params.escrowAddress,
        }).catch(() => {});

        patchTradeInCache(queryClient, params.escrowAddress, (trade) => ({
          ...trade,
          status: 'SOLD',
          canSell: false,
          state: {
            ...trade.state,
            sellPerformed: true,
          },
        }));

        setStep('success');
        return sellHash;
      } catch (err) {
        console.error('Sell trade error:', err);
        setError(err instanceof Error ? err.message : 'Failed to sell trade');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient]
  );

  return {
    sellTrade,
    reset,
    isLoading,
    step,
    error,
  };
}
