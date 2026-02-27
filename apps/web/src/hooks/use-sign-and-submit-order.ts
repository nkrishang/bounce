'use client';

import { useState, useCallback } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { POLYMARKET_ADDRESSES, BounceAbi } from '@bounce/contracts';
import type { BetView } from '@bounce/shared';
import { BetStatus, normalizeBet } from '@bounce/shared';
import { createClients, getWalletAddress } from '@/lib/transaction';
import { parseTransactionError, type ParsedError } from '@/lib/parse-transaction-error';
import { api } from '@/lib/api';

type Step = 'idle' | 'checking' | 'preparing' | 'signing' | 'submitting' | 'polling' | 'confirmed' | 'failed';

const CLOB_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;
const GNOSIS_SAFE_SIGNATURE_TYPE = 2;

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
        if (!ready) throw new Error('Wallet not ready — please wait and try again');
        if (!authenticated) throw new Error('Please sign in to place an order');

        const chainId = POLYGON_CHAIN_ID;
        await wallet.switchChain(chainId);
        const provider = await wallet.getEthereumProvider();

        // Create viem clients for on-chain reads
        const { publicClient } = createClients(chainId, provider);

        // Create ethers v5 signer for @polymarket/clob-client
        const ethersProvider = new ethers.providers.Web3Provider(provider as ethers.providers.ExternalProvider);
        const ethersSigner = ethersProvider.getSigner();
        const address = await ethersSigner.getAddress();

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

        const safeAddress = bet.safe as string;

        // Step 2: Derive CLOB API credentials using the official client
        setStep('signing');

        const tempClient = new ClobClient(CLOB_HOST, POLYGON_CHAIN_ID, ethersSigner as any);
        const apiCreds = await tempClient.createOrDeriveApiKey();

        // Step 3: Initialize trading client with GNOSIS_SAFE signature type
        const clobClient = new ClobClient(
          CLOB_HOST,
          POLYGON_CHAIN_ID,
          ethersSigner as any,
          apiCreds,
          GNOSIS_SAFE_SIGNATURE_TYPE,
          safeAddress,
        );

        // Step 3b: Force CLOB to re-read on-chain balance/allowance after prepareTrade
        await clobClient.updateBalanceAllowance({
          asset_type: 'COLLATERAL' as any,
        });

        // Step 4: Build and submit order as a market order for immediate fill
        setStep('submitting');

        const tokenId = betView.metadata?.outcomeTokenId;
        if (!tokenId) throw new Error('Missing outcome token ID in bet metadata');

        const usdcHuman = Number(bet.inFlightUSDC) / 1_000_000;

        // Determine negRisk from exchange address
        const negRisk =
          bet.exchange.toLowerCase() === POLYMARKET_ADDRESSES.NEG_RISK_CTF_EXCHANGE.toLowerCase();

        // Use a market order (FOK) so it fills immediately at the best available price.
        // price acts as worst-price limit (slippage protection) — 1.0 accepts any price.
        const signedOrder = await clobClient.createMarketOrder({
          tokenID: tokenId,
          amount: usdcHuman,
          side: 'BUY' as any,
          price: 0.99,
        }, {
          tickSize: '0.01',
          negRisk,
        });

        const result = await clobClient.postOrder(signedOrder, 'FOK' as any);
        console.log('[CLOB] postOrder result:', JSON.stringify(result));

        if (!result) {
          throw new Error('Empty response from CLOB');
        }

        // The CLOB HTTP helper returns { error, status } on 4xx/5xx errors
        if ('error' in result) {
          const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
          throw new Error(`CLOB API error (${result.status ?? 'unknown'}): ${errMsg}`);
        }

        if (result.success === false || result.errorMsg) {
          throw new Error(result.errorMsg || 'CLOB order rejected');
        }

        const orderId = result.orderID;
        if (!orderId) {
          throw new Error(`No order ID in CLOB response: ${JSON.stringify(result)}`);
        }

        // Step 5: Register order with backend for polling + finalization
        await api.post(`/bets/${betView.betId}/register-order`, { orderId }, { authToken });

        // Step 6: Poll backend trade-status until finalizeTrade completes
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
