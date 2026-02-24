'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address, keccak256, toBytes } from 'viem';
import { POLYMARKET_ADDRESSES, BounceAbi, ERC20Abi } from '@bounce/contracts';
import { api } from '@/lib/api';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';
import { ensureSafeReady } from '@/lib/polymarket-safe';
import { stakeToTotalCapital, DEFAULT_PROPOSER_CAPITAL_BPS, DEFAULT_PROPOSER_PROFIT_SHARE_BPS, DEFAULT_EXPIRY_DAYS } from '@/lib/bet-math';

type Step = 'idle' | 'ensuring-safe' | 'approving' | 'proposing' | 'saving-metadata' | 'success';

interface ProposeBetParams {
  conditionId: string;
  outcomeTokenId: string;
  isYesOutcome: boolean;
  stakeAmount: bigint; // proposer's 20% in USDC (6 decimals)
  marketSlug: string;
  marketQuestion: string;
  marketImage?: string;
  outcomePrice: string;
  negRisk: boolean; // from market's negRisk field
  positionId?: bigint; // optional, can be derived
}

export function useProposeBet() {
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

  const proposeBet = useCallback(
    async (params: ProposeBetParams) => {
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

        // Step 1: Ensure Safe is ready (deploy + module + guard)
        setStep('ensuring-safe');
        const safeAddress = await ensureSafeReady(walletClient, publicClient, address);

        // Compute parameters
        const totalCapital = stakeToTotalCapital(params.stakeAmount);
        const exchange = params.negRisk
          ? POLYMARKET_ADDRESSES.NEG_RISK_CTF_EXCHANGE
          : POLYMARKET_ADDRESSES.CTF_EXCHANGE;
        const outcomeIndex = params.isYesOutcome ? 0 : 1;
        const positionId = params.positionId ?? 0n;
        const expiresAt = Math.floor(Date.now() / 1000) + DEFAULT_EXPIRY_DAYS * 86400;

        // Step 2: Approve USDC for Bounce contract
        setStep('approving');
        const proposerDeposit = (totalCapital * BigInt(DEFAULT_PROPOSER_CAPITAL_BPS)) / BigInt(10000);
        const existingAllowance = await publicClient.readContract({
          address: POLYMARKET_ADDRESSES.USDC,
          abi: ERC20Abi,
          functionName: 'allowance',
          args: [address, POLYMARKET_ADDRESSES.BOUNCE],
        });

        if ((existingAllowance as bigint) < proposerDeposit) {
          await sendAndConfirm(publicClient, () =>
            walletClient.writeContract({
              chain,
              address: POLYMARKET_ADDRESSES.USDC,
              abi: ERC20Abi,
              functionName: 'approve',
              args: [POLYMARKET_ADDRESSES.BOUNCE, proposerDeposit],
              account: address,
            }),
          );
        }

        // Step 3: Call Bounce.proposeBet
        setStep('proposing');
        const { hash, receipt } = await sendAndConfirm(publicClient, () =>
          walletClient.writeContract({
            chain,
            address: POLYMARKET_ADDRESSES.BOUNCE,
            abi: BounceAbi,
            functionName: 'proposeBet',
            args: [
              safeAddress,
              '0x0000000000000000000000000000000000000000' as Address, // open funder
              exchange,
              params.conditionId as `0x${string}`,
              outcomeIndex,
              positionId,
              totalCapital,
              DEFAULT_PROPOSER_CAPITAL_BPS,
              DEFAULT_PROPOSER_PROFIT_SHARE_BPS,
              expiresAt,
              params.marketSlug,
            ],
            account: address,
          }),
        );

        // Parse BetProposed event to get betId
        const betProposedTopic = keccak256(toBytes('BetProposed(uint256,address,address,address,address,bytes32,uint8,uint256,uint256,uint256,uint40,string)'));
        const betLog = receipt.logs.find((log) => log.topics[0] === betProposedTopic);
        const betId = betLog ? Number(BigInt(betLog.topics[1] || '0')) : 0;

        // Step 4: Save off-chain metadata
        setStep('saving-metadata');
        await api.post(`/bets/${betId}/metadata`, {
          chainId: 137,
          conditionId: params.conditionId,
          outcomeIndex,
          outcomeTokenId: params.outcomeTokenId,
          isYesOutcome: params.isYesOutcome,
          slug: params.marketSlug,
          marketQuestion: params.marketQuestion,
          marketImage: params.marketImage,
          outcomePrice: params.outcomePrice,
        });

        await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
        await queryClient.invalidateQueries({ queryKey: ['bets'] });

        setStep('success');
        return { betId, hash };
      } catch (err) {
        console.error('Propose bet error:', err);
        setError(err instanceof Error ? err.message : 'Failed to propose bet');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient],
  );

  return { proposeBet, reset, isLoading, step, error };
}
