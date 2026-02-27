'use client';

import { useState, useCallback } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { POLYMARKET_ADDRESSES, BounceAbi, CTFExchangeAbi } from '@bounce/contracts';
import type { BetView } from '@bounce/shared';
import { BetStatus, normalizeBet } from '@bounce/shared';
import { createClients, getWalletAddress } from '@/lib/transaction';
import { buildBuyOrder, signOrder, signClobAuth } from '@/lib/polymarket-clob';
import { parseTransactionError, type ParsedError } from '@/lib/parse-transaction-error';
import { api } from '@/lib/api';

type Step = 'idle' | 'checking' | 'preparing' | 'signing' | 'submitting' | 'polling' | 'confirmed' | 'failed';

export interface SignOrderError extends ParsedError {
  errorId: string;
}

export function useSignAndSubmitOrder() {
  const { wallets } = useWallets();
  const { getAccessToken, ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<SignOrderError | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setIsLoading(false);
    setError(null);
  }, []);

  const signAndSubmit = useCallback(
    async (betView: BetView) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        // Ensure Privy session is active before doing anything
        if (!ready) throw new Error('Wallet not ready — please wait and try again');
        if (!authenticated) throw new Error('Please sign in to place an order');

        const chainId = 137;
        await wallet.switchChain(chainId);
        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient } = createClients(chainId, provider);
        const address = await getWalletAddress(walletClient);

        // Acquire auth token upfront — fail fast if unavailable
        const authToken = await getAccessToken();
        if (!authToken) throw new Error('Session expired — please sign in again');

        // Step 1: Check bet status and prepare if needed
        setStep('checking');

        let raw = await publicClient.readContract({
          address: POLYMARKET_ADDRESSES.BOUNCE,
          abi: BounceAbi,
          functionName: 'getBet',
          args: [BigInt(betView.betId)],
        });
        let bet = normalizeBet(raw as Record<string, unknown>);

        if (bet.status === BetStatus.Funded) {
          setStep('preparing');
          await api.post(`/bets/${betView.betId}/prepare`, {}, { authToken });

          // Re-read on-chain to confirm Prepared status
          setStep('checking');
          raw = await publicClient.readContract({
            address: POLYMARKET_ADDRESSES.BOUNCE,
            abi: BounceAbi,
            functionName: 'getBet',
            args: [BigInt(betView.betId)],
          });
          bet = normalizeBet(raw as Record<string, unknown>);
        }

        if (bet.status !== BetStatus.Prepared) {
          throw new Error('Bet is not in Prepared status');
        }

        const exchangeAddress = bet.exchange as `0x${string}`;

        const nonce = await publicClient.readContract({
          address: exchangeAddress,
          abi: CTFExchangeAbi,
          functionName: 'nonces',
          args: [bet.safe as `0x${string}`],
        }) as bigint;

        // Step 2: Derive CLOB API credentials for this signer (idempotent)
        setStep('signing');
        const clobAuth = await signClobAuth(walletClient, address);
        await api.post('/polymarket/clob/derive-key', {
          address,
          signature: clobAuth.signature,
          timestamp: clobAuth.timestamp,
          nonce: clobAuth.nonce,
        }, { authToken });

        // Step 3: Build and sign order

        const tokenId = betView.metadata?.outcomeTokenId;
        if (!tokenId) throw new Error('Missing outcome token ID in bet metadata');

        const price = betView.metadata?.outcomePrice
          ? parseFloat(betView.metadata.outcomePrice)
          : 0.5;

        const order = buildBuyOrder({
          safe: bet.safe as `0x${string}`,
          signer: address,
          tokenId,
          usdcAmount: bet.inFlightUSDC,
          price,
          nonce,
          expiration: 0,
          exchange: exchangeAddress,
        });

        const signature = await signOrder(walletClient, order, exchangeAddress);

        // Step 3: Submit to backend
        setStep('submitting');

        const orderPayload = {
          salt: order.salt.toString(),
          maker: order.maker,
          signer: order.signer,
          taker: order.taker,
          tokenId: order.tokenId.toString(),
          makerAmount: order.makerAmount.toString(),
          takerAmount: order.takerAmount.toString(),
          expiration: order.expiration.toString(),
          nonce: order.nonce.toString(),
          feeRateBps: order.feeRateBps.toString(),
          side: order.side,
          signatureType: order.signatureType,
        };

        const result = await api.post<{ data: { orderID?: string; status?: string } }>(
          '/polymarket/clob/order',
          { betId: betView.betId, order: orderPayload, signature },
        );

        const orderId = result.data?.orderID;
        if (!orderId) {
          throw new Error('No order ID returned from CLOB');
        }

        // Step 4: Poll backend trade-status until finalizeTrade completes
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
              throw new Error(`CLOB order ${tradeStatus.clobStatus}`);
            }

            if (tradeStatus?.finalizeStatus === 'failed') {
              throw new Error(tradeStatus.lastError || 'Trade finalization failed');
            }
          } catch (pollErr) {
            if (i === maxAttempts - 1) throw pollErr;
          }
        }

        throw new Error('Order settlement timed out');
      } catch (err) {
        const parsed = parseTransactionError(err);
        const errorId = `SO-${Date.now().toString(36)}`;
        console.error(`[${errorId}] Sign & submit order error:`, err);
        setError({ ...parsed, errorId });
        setStep('failed');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, getAccessToken, ready, authenticated, queryClient],
  );

  return { signAndSubmit, step, isLoading, error, reset };
}
