'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address } from 'viem';
import { TradeEscrowAbi, ERC20Abi, type ChainId } from '@thesis/contracts';
import type { SwapQuote } from '@thesis/shared';
import { api } from '@/lib/api';
import { patchTradeInCache } from '@/lib/trade-cache';
import { sendAndConfirm, createClients, getWalletAddress } from '@/lib/transaction';

type Step = 'idle' | 'fetching-quote' | 'approve' | 'buy' | 'confirming' | 'success';

interface FundTradeParams {
  chainId: ChainId;
  escrowAddress: Address;
  funderContribution: bigint;
  sellToken: Address;
  buyToken: Address;
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

export function useFundTrade() {
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

  const fundTrade = useCallback(
    async (params: FundTradeParams) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(params.chainId);

        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient, chain } = createClients(params.chainId, provider);

        const address = await getWalletAddress(walletClient);

        // Verify on-chain USDC balance
        const usdcBalance = await publicClient.readContract({
          address: params.sellToken,
          abi: ERC20Abi,
          functionName: 'balanceOf',
          args: [address],
        });

        if (usdcBalance < params.funderContribution) {
          throw new Error('Insufficient USDC balance');
        }

        // Step 1: Approve escrow to pull funder's contribution
        const existingAllowance = await publicClient.readContract({
          address: params.sellToken,
          abi: ERC20Abi,
          functionName: 'allowance',
          args: [address, params.escrowAddress],
        });

        if (existingAllowance < params.funderContribution) {
          setStep('approve');
          const { hash: approveHash } = await sendAndConfirm(
            publicClient,
            () =>
              walletClient.writeContract({
                chain,
                address: params.sellToken,
                abi: ERC20Abi,
                functionName: 'approve',
                args: [params.escrowAddress, params.funderContribution],
                account: address,
              }),
          );
          console.log('Approve tx confirmed:', approveHash);
        } else {
          console.log('Sufficient allowance already exists, skipping approval');
        }

        // Step 2: Get swap quote
        setStep('fetching-quote');
        const totalSellAmount = (params.funderContribution * 5n) / 4n;

        const quote = await getSwapQuote(params.chainId, {
          sellToken: params.sellToken,
          buyToken: params.buyToken,
          sellAmount: totalSellAmount.toString(),
          taker: params.escrowAddress,
          slippageBps: 100,
        });

        console.log('0x Quote received:', {
          sellAmount: quote.sellAmount,
          buyAmount: quote.buyAmount,
          minBuyAmount: quote.minBuyAmount,
          route: quote.route?.fills?.map(f => f.source).join(' -> ') ?? 'unknown',
        });

        // Step 3: Execute buy with 0x quote
        setStep('buy');

        setStep('confirming');
        const { hash: buyHash } = await sendAndConfirm(
          publicClient,
          () =>
            walletClient.writeContract({
              chain,
              address: params.escrowAddress,
              abi: TradeEscrowAbi,
              functionName: 'buy',
              args: [
                BigInt(quote.minBuyAmount),
                quote.swapTarget,
                quote.swapCallData,
              ],
              account: address,
              gas: 2_000_000n,
            }),
        );

        console.log('Buy tx confirmed:', buyHash);

        await api.post('/trades/refresh', {
          chainId: params.chainId,
          escrowAddress: params.escrowAddress,
        }).catch(() => {});

        // Apply optimistic cache patch immediately
        const proposerContribution = totalSellAmount - params.funderContribution;
        patchTradeInCache(queryClient, params.escrowAddress, (trade) => ({
          ...trade,
          status: 'FUNDED',
          canBuy: false,
          state: {
            ...trade.state,
            buyPerformed: true,
            funder: address,
            funderContribution: params.funderContribution.toString(),
            proposerContribution: proposerContribution.toString(),
            totalSellIn: totalSellAmount.toString(),
          },
        }));

        setStep('success');
        return buyHash;
      } catch (err) {
        console.error('Fund trade error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fund trade');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient],
  );

  return {
    fundTrade,
    reset,
    isLoading,
    step,
    error,
  };
}
