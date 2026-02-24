'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { POLYMARKET_ADDRESSES, BounceAbi } from '@bounce/contracts';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';

type Step = 'idle' | 'executing' | 'success';

export function useExecuteTrade() {
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

  const executeTrade = useCallback(
    async (betId: number, maxSpend: bigint, tradeData: `0x${string}`) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        const chainId = 137;
        await wallet.switchChain(chainId);
        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient, chain } = createClients(chainId, provider);
        const address = await getWalletAddress(walletClient);

        setStep('executing');
        const { hash } = await sendAndConfirm(publicClient, () =>
          walletClient.writeContract({
            chain,
            address: POLYMARKET_ADDRESSES.BOUNCE,
            abi: BounceAbi,
            functionName: 'executeTrade',
            args: [BigInt(betId), maxSpend, tradeData],
            account: address,
          }),
        );

        await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
        await queryClient.invalidateQueries({ queryKey: ['bet', betId] });

        setStep('success');
        return hash;
      } catch (err) {
        console.error('Execute trade error:', err);
        setError(err instanceof Error ? err.message : 'Failed to execute trade');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient],
  );

  return { executeTrade, reset, isLoading, step, error };
}
