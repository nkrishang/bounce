'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { createWalletClient, custom, type Address } from 'viem';
import { monad } from 'viem/chains';
import { TradeEscrowAbi, ERC20Abi } from '@escape/contracts';
import { DEFAULT_POOL_FEE } from '@escape/shared';

type Step = 'idle' | 'approve' | 'buy' | 'confirming';

interface FundTradeParams {
  escrowAddress: Address;
  funderContribution: bigint;
  sellToken: Address;
}

export function useFundTrade() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  const fundTrade = useCallback(
    async (params: FundTradeParams) => {
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

        setStep('approve');
        const approveHash = await walletClient.writeContract({
          address: params.sellToken,
          abi: ERC20Abi,
          functionName: 'approve',
          args: [params.escrowAddress, params.funderContribution],
          account: address,
        });

        console.log('Approve tx:', approveHash);

        setStep('buy');
        const buyHash = await walletClient.writeContract({
          address: params.escrowAddress,
          abi: TradeEscrowAbi,
          functionName: 'buy',
          args: [0n, DEFAULT_POOL_FEE],
          account: address,
        });

        console.log('Buy tx:', buyHash);

        setStep('confirming');
        await queryClient.invalidateQueries({ queryKey: ['trades'] });
        await queryClient.invalidateQueries({ queryKey: ['userTrades'] });
        await queryClient.invalidateQueries({ queryKey: ['trade', params.escrowAddress] });

        setStep('idle');
        return buyHash;
      } catch (err) {
        console.error('Fund trade error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fund trade');
        throw err;
      } finally {
        setIsLoading(false);
        setStep('idle');
      }
    },
    [wallets, queryClient]
  );

  return {
    fundTrade,
    isLoading,
    step,
    error,
  };
}
