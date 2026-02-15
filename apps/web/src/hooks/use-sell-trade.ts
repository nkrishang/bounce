'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { createWalletClient, createPublicClient, custom, http, type Address } from 'viem';
import { TradeEscrowAbi, getChain, type ChainId } from '@thesis/contracts';
import type { SwapQuote } from '@thesis/shared';
import { api } from '../lib/api';

type Step = 'idle' | 'fetching-quote' | 'sell' | 'confirming' | 'success';

const RPC_URLS: Record<number, string> = {
  137: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || '',
  8453: process.env.NEXT_PUBLIC_BASE_RPC_URL || '',
  143: process.env.NEXT_PUBLIC_MONAD_RPC_URL || '',
};

interface SellTradeParams {
  chainId: ChainId;
  escrowAddress: Address;
  buyToken: Address;
  sellToken: Address;
  buyTokenAmount: bigint; // The amount of buyToken the escrow holds
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

  const sellTrade = useCallback(
    async (params: SellTradeParams) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(params.chainId);

        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: getChain(params.chainId),
          transport: custom(provider),
        });

        const publicClient = createPublicClient({
          chain: getChain(params.chainId),
          transport: http(RPC_URLS[params.chainId] || undefined),
        });

        const [address] = await walletClient.getAddresses();

        // Step 1: Get swap quote from 0x API
        // For sell, we're swapping buyToken -> sellToken
        setStep('fetching-quote');
        
        const quote = await getSwapQuote(params.chainId, {
          sellToken: params.buyToken, // We're selling the buyToken
          buyToken: params.sellToken, // To get back sellToken
          sellAmount: params.buyTokenAmount.toString(),
          taker: params.escrowAddress, // Escrow is the one making the swap
          slippageBps: 100, // 1% slippage
        });

        console.log('0x Quote received for sell:', {
          sellAmount: quote.sellAmount,
          buyAmount: quote.buyAmount,
          minBuyAmount: quote.minBuyAmount,
          route: quote.route.fills.map(f => f.source).join(' -> '),
        });

        // Step 2: Execute sell with 0x quote
        setStep('sell');
        const sellHash = await walletClient.writeContract({
          address: params.escrowAddress,
          abi: TradeEscrowAbi,
          functionName: 'sell',
          args: [
            BigInt(quote.minBuyAmount),
            quote.swapTarget,
            quote.swapCallData,
          ],
          account: address,
          gas: 2000000n,
        });

        console.log('Sell tx:', sellHash);

        setStep('confirming');
        await publicClient.waitForTransactionReceipt({ hash: sellHash });

        await queryClient.invalidateQueries({ queryKey: ['trades'] });
        await queryClient.invalidateQueries({ queryKey: ['userTrades'] });
        await queryClient.invalidateQueries({ queryKey: ['trade', params.escrowAddress] });

        setStep('success');
        setIsLoading(false);
        return sellHash;
      } catch (err) {
        console.error('Sell trade error:', err);
        setError(err instanceof Error ? err.message : 'Failed to sell trade');
        setIsLoading(false);
        throw err;
      }
    },
    [wallets, queryClient]
  );

  return {
    sellTrade,
    isLoading,
    step,
    error,
  };
}
