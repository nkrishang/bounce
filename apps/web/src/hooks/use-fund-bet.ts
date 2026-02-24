'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { POLYMARKET_ADDRESSES, BounceAbi, ERC20Abi, assertBounceConfigured } from '@bounce/contracts';
import { normalizeBet } from '@bounce/shared';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';

type Step = 'idle' | 'approving' | 'funding' | 'success';

export function useFundBet() {
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

  const fundBet = useCallback(
    async (betId: number) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');
      assertBounceConfigured();

      setIsLoading(true);
      setError(null);

      try {
        const chainId = 137;
        await wallet.switchChain(chainId);
        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient, chain } = createClients(chainId, provider);
        const address = await getWalletAddress(walletClient);

        // Read bet on-chain to get funder deposit amount
        const raw = await publicClient.readContract({
          address: POLYMARKET_ADDRESSES.BOUNCE,
          abi: BounceAbi,
          functionName: 'getBet',
          args: [BigInt(betId)],
        });
        const bet = normalizeBet(raw as Record<string, unknown>);

        const totalCapital = bet.totalCapital;
        const proposerDeposit = (totalCapital * BigInt(bet.proposerCapitalBps)) / 10000n;
        const funderDeposit = totalCapital - proposerDeposit;

        // Step 1: Approve USDC for Bounce
        setStep('approving');
        const existingAllowance = await publicClient.readContract({
          address: POLYMARKET_ADDRESSES.USDC,
          abi: ERC20Abi,
          functionName: 'allowance',
          args: [address, POLYMARKET_ADDRESSES.BOUNCE],
        });

        if ((existingAllowance as bigint) < funderDeposit) {
          await sendAndConfirm(publicClient, () =>
            walletClient.writeContract({
              chain,
              address: POLYMARKET_ADDRESSES.USDC,
              abi: ERC20Abi,
              functionName: 'approve',
              args: [POLYMARKET_ADDRESSES.BOUNCE, funderDeposit],
              account: address,
            }),
          );
        }

        // Step 2: Fund the bet
        setStep('funding');
        const { hash } = await sendAndConfirm(publicClient, () =>
          walletClient.writeContract({
            chain,
            address: POLYMARKET_ADDRESSES.BOUNCE,
            abi: BounceAbi,
            functionName: 'fundBet',
            args: [BigInt(betId)],
            account: address,
          }),
        );

        await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
        await queryClient.invalidateQueries({ queryKey: ['bets'] });

        setStep('success');
        return hash;
      } catch (err) {
        console.error('Fund bet error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fund bet');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient],
  );

  return { fundBet, reset, isLoading, step, error };
}
