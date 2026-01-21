'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { createWalletClient, custom, type Address } from 'viem';
import { monad } from 'viem/chains';
import { TradeEscrowAbi } from '@escape/contracts';
import { DEFAULT_POOL_FEE } from '@escape/shared';

type Step = 'idle' | 'approve' | 'sell' | 'confirming';

interface SellTradeParams {
  escrowAddress: Address;
  buyToken: Address;
}

export function useSellTrade() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  const sellTrade = useCallback(
    async (params: SellTradeParams) => {
      const wallet = wallets[0];
      if (!wallet) throw new Error('No wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: monad,
          transport: custom(provider),
        });

        const [address] = await walletClient.getAddresses();

        setStep('sell');
        const sellHash = await walletClient.writeContract({
          address: params.escrowAddress,
          abi: TradeEscrowAbi,
          functionName: 'sell',
          args: [0n, DEFAULT_POOL_FEE],
          account: address,
        });

        console.log('Sell tx:', sellHash);

        setStep('confirming');
        await queryClient.invalidateQueries({ queryKey: ['trades'] });
        await queryClient.invalidateQueries({ queryKey: ['userTrades'] });
        await queryClient.invalidateQueries({ queryKey: ['trade', params.escrowAddress] });

        setStep('idle');
        return sellHash;
      } catch (err) {
        console.error('Sell trade error:', err);
        setError(err instanceof Error ? err.message : 'Failed to sell trade');
        throw err;
      } finally {
        setIsLoading(false);
        setStep('idle');
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
