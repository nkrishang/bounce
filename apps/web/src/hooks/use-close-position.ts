'use client';

import { useState, useCallback } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { POLYMARKET_ADDRESSES, BounceAbi } from '@bounce/contracts';
import type { BetView } from '@bounce/shared';
import { BetStatus, normalizeBet } from '@bounce/shared';
import { createClients } from '@/lib/transaction';
import { parseTransactionError, type ParsedError } from '@/lib/parse-transaction-error';
import { api } from '@/lib/api';

type Step = 'idle' | 'checking' | 'signing' | 'submitting' | 'polling' | 'confirmed' | 'failed';

const CLOB_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;
const GNOSIS_SAFE_SIGNATURE_TYPE = 2;

export interface ClosePositionError extends ParsedError {
  errorId: string;
}

export function useClosePosition() {
  const { wallets } = useWallets();
  const { getAccessToken, ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<ClosePositionError | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setIsLoading(false);
    setError(null);
  }, []);

  const closePosition = useCallback(
    async (betView: BetView) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        if (!ready) throw new Error('Wallet not ready — please wait and try again');
        if (!authenticated) throw new Error('Please sign in to sell your position');

        const chainId = POLYGON_CHAIN_ID;
        await wallet.switchChain(chainId);
        const provider = await wallet.getEthereumProvider();

        const { publicClient } = createClients(chainId, provider);

        const ethersProvider = new ethers.providers.Web3Provider(provider as ethers.providers.ExternalProvider);
        const ethersSigner = ethersProvider.getSigner();
        const address = await ethersSigner.getAddress();

        const authToken = await getAccessToken();
        if (!authToken) throw new Error('Session expired — please sign in again');

        // Step 1: Verify bet is in Traded status
        setStep('checking');

        const raw = await publicClient.readContract({
          address: POLYMARKET_ADDRESSES.BOUNCE,
          abi: BounceAbi,
          functionName: 'getBet',
          args: [BigInt(betView.betId)],
        });
        const bet = normalizeBet(raw as Record<string, unknown>);

        if (bet.status !== BetStatus.Traded) {
          throw new Error(`Bet is not in Traded status (current: ${bet.status})`);
        }

        if (bet.positionShares === 0n) {
          throw new Error('No shares to sell');
        }

        const safeAddress = bet.safe as string;

        // Step 2: Derive CLOB API credentials
        setStep('signing');

        const tempClient = new ClobClient(CLOB_HOST, POLYGON_CHAIN_ID, ethersSigner as any);
        const apiCreds = await tempClient.createOrDeriveApiKey();

        const clobClient = new ClobClient(
          CLOB_HOST,
          POLYGON_CHAIN_ID,
          ethersSigner as any,
          apiCreds,
          GNOSIS_SAFE_SIGNATURE_TYPE,
          safeAddress,
        );

        // Step 3: Wait for CLOB to index conditional token balance/allowance
        setStep('submitting');

        const tokenId = betView.metadata?.outcomeTokenId;
        if (!tokenId) throw new Error('Missing outcome token ID in bet metadata');

        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            await clobClient.updateBalanceAllowance({
              asset_type: 'CONDITIONAL' as any,
              token_id: tokenId,
            });
            break;
          } catch {
            if (attempt === 11) {
              throw new Error('CLOB has not indexed the conditional token balance — please retry shortly');
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        // Sell all shares
        const sharesHuman = Number(bet.positionShares) / 1_000_000;

        const negRisk =
          bet.exchange.toLowerCase() === POLYMARKET_ADDRESSES.NEG_RISK_CTF_EXCHANGE.toLowerCase();

        // Market order with worst-price limit of 0.01 (accept any price ≥ 1¢)
        const signedOrder = await clobClient.createMarketOrder({
          tokenID: tokenId,
          amount: sharesHuman,
          side: 'SELL' as any,
          price: 0.01,
        }, {
          tickSize: '0.01',
          negRisk,
        });

        const result = await clobClient.postOrder(signedOrder, 'FOK' as any);
        console.log('[CLOB] postOrder SELL result:', JSON.stringify(result));

        if (!result) {
          throw new Error('Empty response from CLOB');
        }

        if ('error' in result) {
          const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
          throw new Error(`CLOB API error (${result.status ?? 'unknown'}): ${errMsg}`);
        }

        if (result.success === false || result.errorMsg) {
          throw new Error(result.errorMsg || 'CLOB sell order rejected');
        }

        const orderId = result.orderID;
        if (!orderId) {
          throw new Error(`No order ID in CLOB response: ${JSON.stringify(result)}`);
        }

        // Step 4: Register close order with backend (with retry)
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await api.post(`/bets/${betView.betId}/register-order`, { orderId, flow: 'close' }, { authToken });
            break;
          } catch (registerErr) {
            if (attempt === 4) {
              console.error('Failed to register close order after retries:', registerErr);
              throw new Error(`Sell order placed (${orderId}) but failed to register with backend. Please contact support.`);
            }
            await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
          }
        }

        // Step 5: Poll backend trade-status until closePosition completes
        setStep('polling');

        const maxAttempts = 60; // 5 minutes at 5s intervals
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise((resolve) => setTimeout(resolve, 5000));

          try {
            const statusResult = await api.get<{
              data: {
                clobStatus?: string;
                finalizeStatus?: string;
                lastError?: string;
              } | null;
            }>(`/bets/${betView.betId}/trade-status`);

            const tradeStatus = statusResult.data;

            if (tradeStatus?.finalizeStatus === 'confirmed') {
              setStep('confirmed');
              queryClient.invalidateQueries({ queryKey: ['my-bets'] });
              queryClient.invalidateQueries({ queryKey: ['bet', betView.betId] });
              queryClient.invalidateQueries({ queryKey: ['trade-status', betView.betId] });
              queryClient.invalidateQueries({ queryKey: ['walletBalances', address] });
              return orderId;
            }

            if (tradeStatus?.clobStatus === 'FAILED' || tradeStatus?.clobStatus === 'CANCELED') {
              throw new Error(`CLOB sell order ${tradeStatus.clobStatus}`);
            }

            if (tradeStatus?.finalizeStatus === 'failed') {
              // Retry reconciliation before giving up — the on-chain state may have settled
              try {
                await api.post(`/bets/${betView.betId}/reconcile`, {}, { authToken });
              } catch { /* will retry on next poll iteration */ }
              continue;
            }

            // If CLOB settled but finalize not started, nudge the backend
            if (
              tradeStatus?.clobStatus === 'MATCHED' || tradeStatus?.clobStatus === 'CONFIRMED' || tradeStatus?.clobStatus === 'MINED'
            ) {
              if (!tradeStatus.finalizeStatus || tradeStatus.finalizeStatus === 'failed') {
                try {
                  await api.post(`/bets/${betView.betId}/reconcile`, {}, { authToken });
                } catch { /* poller will retry */ }
              }
            }
          } catch (pollErr) {
            if (i === maxAttempts - 1) throw pollErr;
          }
        }

        throw new Error('Sell order settlement timed out');
      } catch (err) {
        const parsed = parseTransactionError(err);
        const errorId = `CP-${Date.now().toString(36)}`;
        console.error(`[${errorId}] Close position error:`, err);
        setError({ ...parsed, errorId });
        setStep('failed');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, getAccessToken, ready, authenticated, queryClient],
  );

  const resumeClose = useCallback(
    async (betId: number) => {
      setIsLoading(true);
      setError(null);
      setStep('polling');

      try {
        if (!ready) throw new Error('Wallet not ready — please wait and try again');
        if (!authenticated) throw new Error('Please sign in');

        const authToken = await getAccessToken();
        if (!authToken) throw new Error('Session expired — please sign in again');

        const wallet = wallets.find((w) => w.walletClientType === 'privy');
        const address = wallet ? await wallet.getEthereumProvider().then(async (p) => {
          const ethersProvider = new ethers.providers.Web3Provider(p as ethers.providers.ExternalProvider);
          return ethersProvider.getSigner().getAddress();
        }) : undefined;

        const maxAttempts = 60;
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise((resolve) => setTimeout(resolve, 5000));

          try {
            const statusResult = await api.get<{
              data: {
                clobStatus?: string;
                finalizeStatus?: string;
                lastError?: string;
              } | null;
            }>(`/bets/${betId}/trade-status`);

            const tradeStatus = statusResult.data;

            if (tradeStatus?.finalizeStatus === 'confirmed') {
              setStep('confirmed');
              queryClient.invalidateQueries({ queryKey: ['my-bets'] });
              queryClient.invalidateQueries({ queryKey: ['bet', betId] });
              queryClient.invalidateQueries({ queryKey: ['trade-status', betId] });
              if (address) queryClient.invalidateQueries({ queryKey: ['walletBalances', address] });
              return;
            }

            if (tradeStatus?.clobStatus === 'FAILED' || tradeStatus?.clobStatus === 'CANCELED') {
              throw new Error(`CLOB sell order ${tradeStatus.clobStatus}`);
            }

            if (tradeStatus?.finalizeStatus === 'failed') {
              try {
                await api.post(`/bets/${betId}/reconcile`, {}, { authToken });
              } catch { /* will retry on next poll iteration */ }
              continue;
            }

            if (
              tradeStatus?.clobStatus === 'MATCHED' || tradeStatus?.clobStatus === 'CONFIRMED' || tradeStatus?.clobStatus === 'MINED'
            ) {
              if (!tradeStatus.finalizeStatus || tradeStatus.finalizeStatus === 'failed') {
                try {
                  await api.post(`/bets/${betId}/reconcile`, {}, { authToken });
                } catch { /* poller will retry */ }
              }
            }
          } catch (pollErr) {
            if (i === maxAttempts - 1) throw pollErr;
          }
        }

        throw new Error('Sell order settlement timed out');
      } catch (err) {
        const parsed = parseTransactionError(err);
        const errorId = `CP-${Date.now().toString(36)}`;
        console.error(`[${errorId}] Resume close error:`, err);
        setError({ ...parsed, errorId });
        setStep('failed');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, getAccessToken, ready, authenticated, queryClient],
  );

  return { closePosition, resumeClose, step, isLoading, error, reset };
}
