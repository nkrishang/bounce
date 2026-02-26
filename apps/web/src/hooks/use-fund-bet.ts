'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { POLYMARKET_ADDRESSES, BounceAbi, ERC20Abi, assertBounceConfigured } from '@bounce/contracts';
import { normalizeBet } from '@bounce/shared';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';
import { parseTransactionError, type ParsedError } from '@/lib/parse-transaction-error';

type Step = 'idle' | 'approving' | 'funding' | 'success';

export interface FundBetError extends ParsedError {
  errorId: string;
}

export function useFundBet() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<FundBetError | null>(null);

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
        const { walletClient, publicClient } = createClients(chainId, provider);
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
          const { request: approveRequest } = await publicClient.simulateContract({
            account: address,
            address: POLYMARKET_ADDRESSES.USDC,
            abi: ERC20Abi,
            functionName: 'approve',
            args: [POLYMARKET_ADDRESSES.BOUNCE, funderDeposit],
          });
          await sendAndConfirm(publicClient, () =>
            walletClient.writeContract(approveRequest),
          );
        }

        // Step 2: Fund the bet
        setStep('funding');
        const { request: fundRequest } = await publicClient.simulateContract({
          account: address,
          address: POLYMARKET_ADDRESSES.BOUNCE,
          abi: BounceAbi,
          functionName: 'fundBet',
          args: [BigInt(betId)],
        });
        const { hash } = await sendAndConfirm(publicClient, () =>
          walletClient.writeContract(fundRequest),
        );

        await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
        await queryClient.invalidateQueries({ queryKey: ['bets'] });

        setStep('success');
        await queryClient.invalidateQueries({ queryKey: ['walletBalances', address] });
        return hash;
      } catch (err) {
        const parsed = parseTransactionError(err);
        const errorId = `FB-${Date.now().toString(36)}`;
        console.error(`[${errorId}] Fund bet error:`, err);
        setError({ ...parsed, errorId });
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
