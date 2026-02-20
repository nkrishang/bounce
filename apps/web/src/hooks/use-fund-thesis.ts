'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address } from 'viem';
import {
  POLYMARKET_ADDRESSES,
  ThesisFactoryV2Abi,
  ERC20Abi,
} from '@bounce/contracts';
import type { Proposal } from '@bounce/shared';
import { api } from '@/lib/api';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';
import type { ChainId } from '@bounce/contracts';

type Step = 'idle' | 'approving' | 'transferring' | 'creating-thesis' | 'updating' | 'success';

export function useFundThesis() {
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

  const fundThesis = useCallback(
    async (proposal: Proposal) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        const chainId: ChainId = 137;
        await wallet.switchChain(chainId);

        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient, chain } = createClients(chainId, provider);
        const address = await getWalletAddress(walletClient);

        const totalCapital = BigInt(proposal.totalCapital);
        const proposerContribution = BigInt(proposal.proposerContribution);
        const funderContribution = totalCapital - proposerContribution;

        // Step 1: Approve USDC for Safe
        setStep('approving');
        const existingAllowance = await publicClient.readContract({
          address: POLYMARKET_ADDRESSES.USDC,
          abi: ERC20Abi,
          functionName: 'allowance',
          args: [address, proposal.safe as Address],
        });

        if ((existingAllowance as bigint) < funderContribution) {
          await sendAndConfirm(
            publicClient,
            () =>
              walletClient.writeContract({
                chain,
                address: POLYMARKET_ADDRESSES.USDC,
                abi: ERC20Abi,
                functionName: 'approve',
                args: [proposal.safe as Address, funderContribution],
                account: address,
              }),
          );
        }

        // Step 2: Transfer USDC to Safe
        setStep('transferring');
        await sendAndConfirm(
          publicClient,
          () =>
            walletClient.writeContract({
              chain,
              address: POLYMARKET_ADDRESSES.USDC,
              abi: ERC20Abi,
              functionName: 'transfer',
              args: [proposal.safe as Address, funderContribution],
              account: address,
            }),
        );

        // Step 3: Create thesis on-chain
        setStep('creating-thesis');
        const { hash } = await sendAndConfirm(
          publicClient,
          () =>
            walletClient.writeContract({
              chain,
              address: POLYMARKET_ADDRESSES.THESIS_FACTORY,
              abi: ThesisFactoryV2Abi,
              functionName: 'createThesis',
              args: [
                proposal.proposer as Address,
                address,
                proposal.safe as Address,
                totalCapital,
              ],
              account: address,
            }),
        );
        console.log('Thesis created on-chain:', hash);

        // Step 4: Update proposal in API
        setStep('updating');
        await api.patch(`/proposals/${proposal.id}`, {
          funder: address,
          status: 'FUNDED',
        });

        await queryClient.invalidateQueries({ queryKey: ['proposals'] });
        await queryClient.invalidateQueries({ queryKey: ['user-proposals'] });

        setStep('success');
        return hash;
      } catch (err) {
        console.error('Fund thesis error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fund thesis');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient]
  );

  return { fundThesis, reset, isLoading, step, error };
}
