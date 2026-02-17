'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address } from 'viem';
import { TradeEscrowAbi, type ChainId } from '@bounce/contracts';
import { api } from '@/lib/api';
import { patchTradeInCache } from '@/lib/trade-cache';
import { sendAndConfirm, createClients, getWalletAddress } from '@/lib/transaction';

type WithdrawStep = 'idle' | 'withdrawing' | 'confirming' | 'success';

export function useWithdraw() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<WithdrawStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setIsLoading(false);
    setError(null);
  }, []);

  const executeWithdraw = useCallback(
    async (
      chainId: ChainId,
      escrowAddress: Address,
      role: 'proposer' | 'funder',
    ) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(chainId);

        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient, chain } = createClients(chainId, provider);

        const address = await getWalletAddress(walletClient);

        const functionName = role === 'proposer' ? 'withdrawProposer' : 'withdrawFunder';

        setStep('withdrawing');

        setStep('confirming');
        const { hash } = await sendAndConfirm(
          publicClient,
          () =>
            walletClient.writeContract({
              chain,
              address: escrowAddress,
              abi: TradeEscrowAbi,
              functionName,
              account: address,
            }),
        );

        console.log(`Withdraw ${role} tx confirmed:`, hash);

        await api.post('/trades/refresh', { chainId, escrowAddress }).catch(() => {});

        const patchKey = role === 'proposer' ? 'canWithdrawProposer' : 'canWithdrawFunder';
        const stateKey = role === 'proposer' ? 'withdrawProposerPerformed' : 'withdrawFunderPerformed';

        patchTradeInCache(queryClient, escrowAddress, (trade) => ({
          ...trade,
          [patchKey]: false,
          state: {
            ...trade.state,
            [stateKey]: true,
          },
        }));

        queryClient.invalidateQueries({ queryKey: ['trades'] });
        queryClient.invalidateQueries({ queryKey: ['userTrades'] });
        queryClient.invalidateQueries({ queryKey: ['trade', escrowAddress] });
        queryClient.invalidateQueries({ queryKey: ['walletBalance'] });

        setStep('success');
        return hash;
      } catch (err) {
        console.error(`Withdraw ${role} error:`, err);
        setError(err instanceof Error ? err.message : 'Failed to withdraw');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient]
  );

  const withdrawProposer = useCallback(
    (chainId: ChainId, escrowAddress: Address) =>
      executeWithdraw(chainId, escrowAddress, 'proposer'),
    [executeWithdraw]
  );

  const withdrawFunder = useCallback(
    (chainId: ChainId, escrowAddress: Address) =>
      executeWithdraw(chainId, escrowAddress, 'funder'),
    [executeWithdraw]
  );

  return {
    withdrawProposer,
    withdrawFunder,
    reset,
    isLoading,
    step,
    error,
  };
}
