'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { POLYMARKET_ADDRESSES, BounceAbi } from '@bounce/contracts';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';
import { parseTransactionError, type ParsedError } from '@/lib/parse-transaction-error';

type Step = 'idle' | 'cancelling' | 'success';

export interface CancelBetError extends ParsedError {
  errorId: string;
}

export function useCancelBet() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<CancelBetError | null>(null);

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
        await queryClient.invalidateQueries({ queryKey: ['walletBalances', address] });

        setStep('success');
        return hash;
      } catch (err) {
        const parsed = parseTransactionError(err);
        const errorId = `CB-${Date.now().toString(36)}`;
        console.error(`[${errorId}] Cancel bet error:`, err);
        setError({ ...parsed, errorId });
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
