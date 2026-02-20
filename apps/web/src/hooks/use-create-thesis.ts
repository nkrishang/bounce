'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address, encodeFunctionData } from 'viem';
import {
  POLYMARKET_ADDRESSES,
  ThesisFactoryV2Abi,
  ERC20Abi,
  GnosisSafeAbi,
} from '@bounce/contracts';
import { api } from '@/lib/api';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';
import { deriveSafeAddress, isSafeDeployed, deployPolySafe } from '@/lib/polymarket-safe';
import { execSafeTransaction } from '@/lib/safe';
import type { ChainId } from '@bounce/contracts';

type Step =
  | 'idle'
  | 'deploying-safe'
  | 'deploying-guard'
  | 'setting-guard'
  | 'approving'
  | 'transferring'
  | 'registering'
  | 'success';

interface CreateThesisParams {
  conditionId: string;
  outcomeTokenId: string;
  isYesOutcome: boolean;
  proposerContribution: bigint; // 20% in USDC (6 decimals)
  marketSlug?: string;
  marketQuestion?: string;
  marketImage?: string;
  outcomePrice?: string;
}

export function useCreateThesis() {
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

  const createThesis = useCallback(
    async (params: CreateThesisParams) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        // Always use Polygon for Polymarket
        const chainId: ChainId = 137;
        await wallet.switchChain(chainId);

        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient, chain } = createClients(chainId, provider);
        const address = await getWalletAddress(walletClient);

        const totalCapitalActual = params.proposerContribution * 5n;

        // Step 1: Deploy Safe
        setStep('deploying-safe');
        const safeAddress = deriveSafeAddress(address);
        const deployed = await isSafeDeployed(publicClient, safeAddress);
        if (!deployed) {
          await deployPolySafe(walletClient, publicClient, address);
        }
        console.log('Safe address:', safeAddress);

        // Step 2: Deploy Guard
        setStep('deploying-guard');
        const { hash: guardHash, receipt: guardReceipt } = await sendAndConfirm(
          publicClient,
          () =>
            walletClient.writeContract({
              chain,
              address: POLYMARKET_ADDRESSES.THESIS_FACTORY,
              abi: ThesisFactoryV2Abi,
              functionName: 'deployGuard',
              args: [safeAddress],
              account: address,
            }),
        );

        // Extract guard address from receipt logs (first topic of deployment event)
        // For now, we'll read it from the factory
        const guardAddress = guardReceipt.logs[0]?.address as Address;
        console.log('Guard deployed:', guardAddress, 'tx:', guardHash);

        // Step 3: Set guard on Safe
        setStep('setting-guard');
        const setGuardData = encodeFunctionData({
          abi: GnosisSafeAbi,
          functionName: 'setGuard',
          args: [guardAddress],
        });
        await execSafeTransaction(walletClient, publicClient, safeAddress, address, {
          to: safeAddress,
          data: setGuardData,
        });
        console.log('Guard set on Safe');

        // Step 4: Approve USDC transfer
        setStep('approving');
        const existingAllowance = await publicClient.readContract({
          address: POLYMARKET_ADDRESSES.USDC,
          abi: ERC20Abi,
          functionName: 'allowance',
          args: [address, safeAddress],
        });

        if ((existingAllowance as bigint) < params.proposerContribution) {
          await sendAndConfirm(
            publicClient,
            () =>
              walletClient.writeContract({
                chain,
                address: POLYMARKET_ADDRESSES.USDC,
                abi: ERC20Abi,
                functionName: 'approve',
                args: [safeAddress, params.proposerContribution],
                account: address,
              }),
          );
        }

        // Step 5: Transfer USDC to Safe
        setStep('transferring');
        await sendAndConfirm(
          publicClient,
          () =>
            walletClient.writeContract({
              chain,
              address: POLYMARKET_ADDRESSES.USDC,
              abi: ERC20Abi,
              functionName: 'transfer',
              args: [safeAddress, params.proposerContribution],
              account: address,
            }),
        );
        console.log('USDC transferred to Safe');

        // Step 6: Register proposal in API
        setStep('registering');
        const proposal = await api.post<{ data: any }>('/proposals', {
          proposer: address,
          safe: safeAddress,
          guard: guardAddress,
          totalCapital: totalCapitalActual.toString(),
          proposerContribution: params.proposerContribution.toString(),
          conditionId: params.conditionId,
          outcomeTokenId: params.outcomeTokenId,
          isYesOutcome: params.isYesOutcome,
          marketSlug: params.marketSlug,
          marketQuestion: params.marketQuestion,
          marketImage: params.marketImage,
          outcomePrice: params.outcomePrice,
        });

        await queryClient.invalidateQueries({ queryKey: ['proposals'] });
        await queryClient.invalidateQueries({ queryKey: ['user-proposals'] });

        setStep('success');
        return proposal.data;
      } catch (err) {
        console.error('Create thesis error:', err);
        setError(err instanceof Error ? err.message : 'Failed to create thesis');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient]
  );

  return { createThesis, reset, isLoading, step, error };
}
