'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { POLYMARKET_ADDRESSES, BounceAbi } from '@bounce/contracts';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';

type Step = 'idle' | 'cancelling' | 'success';

export function useCancelBet() {
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

  const cancelBet = useCallback(
    async (betId: number) => {
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

        setStep('cancelling');
        const { hash } = await sendAndConfirm(publicClient, () =>
          walletClient.writeContract({
            chain,
            address: POLYMARKET_ADDRESSES.BOUNCE,
            abi: BounceAbi,
            functionName: 'cancelBet',
            args: [BigInt(betId)],
            account: address,
          }),
        );

        await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
        await queryClient.invalidateQueries({ queryKey: ['bets'] });

        setStep('success');
        return hash;
      } catch (err) {
        console.error('Cancel bet error:', err);
        setError(err instanceof Error ? err.message : 'Failed to cancel bet');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient],
  );

  return { cancelBet, reset, isLoading, step, error };
}
