'use client';

import { useState, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address, parseEventLogs } from 'viem';
import { POLYMARKET_ADDRESSES, BounceAbi, ERC20Abi, assertBounceConfigured } from '@bounce/contracts';
import { validateConditionId } from '@bounce/shared';
import { api, ApiError } from '@/lib/api';
import { createClients, getWalletAddress, sendAndConfirm } from '@/lib/transaction';
import { ensureSafeReady } from '@/lib/polymarket-safe';
import { parseTransactionError, type ParsedError } from '@/lib/parse-transaction-error';
import { stakeToTotalCapital, DEFAULT_PROPOSER_CAPITAL_BPS, DEFAULT_PROPOSER_PROFIT_SHARE_BPS, DEFAULT_EXPIRY_DAYS } from '@/lib/bet-math';

type Step = 'idle' | 'ensuring-safe' | 'approving' | 'proposing' | 'saving-metadata' | 'success' | 'success-needs-refresh';

export interface ProposeBetError extends ParsedError {
  errorId: string;
}

interface ProposeBetParams {
  conditionId: string;
  outcomeIndex: number; // actual index from token list position (not assumed from Yes/No)
  outcomeTokenId: string; // CLOB token ID = CTF ERC1155 position ID
  isYesOutcome: boolean;
  stakeAmount: bigint; // proposer's 20% in USDC (6 decimals)
  marketSlug: string;
  marketQuestion: string;
  marketImage?: string;
  outcomePrice: string;
  negRisk: boolean; // from market's negRisk field
}

export function useProposeBet() {
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<ProposeBetError | null>(null);
  const [warning, setWarning] = useState<ProposeBetError | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setIsLoading(false);
    setError(null);
    setWarning(null);
  }, []);

  const proposeBet = useCallback(
    async (params: ProposeBetParams) => {
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

        // Step 1: Ensure Safe is ready (deploy + module + guard)
        setStep('ensuring-safe');
        const safeAddress = await ensureSafeReady(walletClient, publicClient, address);
        await queryClient.invalidateQueries({ queryKey: ['safe-status', address] });

        // Compute parameters
        const conditionIdHex = validateConditionId(params.conditionId);
        const totalCapital = stakeToTotalCapital(params.stakeAmount);
        const exchange = params.negRisk
          ? POLYMARKET_ADDRESSES.NEG_RISK_CTF_EXCHANGE
          : POLYMARKET_ADDRESSES.CTF_EXCHANGE;
        const outcomeIndex = params.outcomeIndex;
        const positionId = BigInt(params.outcomeTokenId);
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
          const { request: approveRequest } = await publicClient.simulateContract({
            account: address,
            address: POLYMARKET_ADDRESSES.USDC,
            abi: ERC20Abi,
            functionName: 'approve',
            args: [POLYMARKET_ADDRESSES.BOUNCE, proposerDeposit],
          });
          await sendAndConfirm(publicClient, () =>
            walletClient.writeContract(approveRequest),
          );
        }

        // Step 3: Call Bounce.proposeBet
        setStep('proposing');
        const { request: proposeRequest } = await publicClient.simulateContract({
          account: address,
          address: POLYMARKET_ADDRESSES.BOUNCE,
          abi: BounceAbi,
          functionName: 'proposeBet',
          args: [
            safeAddress,
            '0x0000000000000000000000000000000000000000' as Address, // open funder
            exchange,
            conditionIdHex,
            outcomeIndex,
            positionId,
            totalCapital,
            DEFAULT_PROPOSER_CAPITAL_BPS,
            DEFAULT_PROPOSER_PROFIT_SHARE_BPS,
            expiresAt,
            params.marketSlug,
          ],
        });
        const { hash, receipt } = await sendAndConfirm(publicClient, () =>
          walletClient.writeContract(proposeRequest),
        );

        // Parse BetProposed event to get betId
        const parsedLogs = parseEventLogs({
          abi: BounceAbi,
          logs: receipt.logs,
          eventName: 'BetProposed',
        });
        if (parsedLogs.length === 0) {
          throw new Error('BetProposed event not found in transaction receipt');
        }
        const betId = Number(parsedLogs[0].args.betId);

        // Step 4: Save off-chain metadata (best-effort — on-chain tx already confirmed)
        setStep('saving-metadata');
        const authToken = await getAccessToken();

        try {
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
          }, { authToken: authToken || undefined });

          await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
          await queryClient.invalidateQueries({ queryKey: ['bets'] });
          setStep('success');
        } catch (metaErr) {
          if (metaErr instanceof ApiError && metaErr.status === 409) {
            // Only treat as success if existing metadata matches this bet (idempotent retry)
            const existing = (metaErr.body as any)?.data;
            const isSameCondition = existing?.conditionId &&
              existing.conditionId.toLowerCase() === params.conditionId.toLowerCase();
            const isSameBet = isSameCondition &&
              existing.outcomeIndex === outcomeIndex &&
              String(existing.outcomeTokenId) === String(params.outcomeTokenId);

            if (isSameBet) {
              await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
              await queryClient.invalidateQueries({ queryKey: ['bets'] });
              setStep('success');
            } else {
              const parsed = parseTransactionError(metaErr);
              const errorId = `PB-META-CONFLICT-${Date.now().toString(36)}`;
              console.error(`[${errorId}] Metadata conflict — existing row does not match:`, { existing, params });
              setWarning({ ...parsed, errorId });
              setStep('success-needs-refresh');
            }
          } else {
            const parsed = parseTransactionError(metaErr);
            const errorId = `PB-META-${Date.now().toString(36)}`;
            console.error(`[${errorId}] Metadata save failed (on-chain tx succeeded):`, metaErr);
            setWarning({ ...parsed, errorId });
            setStep('success-needs-refresh');
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['walletBalances', address] });
        return { betId, hash };
      } catch (err) {
        const parsed = parseTransactionError(err);
        const errorId = `PB-${Date.now().toString(36)}`;
        console.error(`[${errorId}] Propose bet error:`, err);
        setError({ ...parsed, errorId });
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, getAccessToken, queryClient],
  );

  return { proposeBet, reset, isLoading, step, error, warning };
}
