'use client';

import { useState, useCallback } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { POLYMARKET_ADDRESSES, BounceAbi, ERC20Abi } from '@bounce/contracts';
import type { BetView } from '@bounce/shared';
import { BetStatus, normalizeBet } from '@bounce/shared';
import { createClients } from '@/lib/transaction';
import { parseTransactionError, type ParsedError } from '@/lib/parse-transaction-error';
import { api } from '@/lib/api';

type Step = 'idle' | 'checking' | 'preparing' | 'signing' | 'submitting' | 'polling' | 'confirmed' | 'failed';

const CLOB_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;
const GNOSIS_SAFE_SIGNATURE_TYPE = 2;

export interface SignOrderError extends ParsedError {
  errorId: string;
}

/**
 * Derives CLOB API credentials for the given signer.
 *
 * The SDK's HTTP helpers NEVER throw on 4xx/5xx — they catch errors internally
 * and return { error: "...", status: 400 } instead of the expected data shape.
 * The SDK's .then() mapper then produces { key: undefined, secret: undefined, passphrase: undefined }.
 *
 * We must validate the returned creds have real values, and try derive → create with validation.
 */
export async function deriveClobApiCreds(signer: ethers.Signer) {
  const client = new ClobClient(
    CLOB_HOST, POLYGON_CHAIN_ID, signer as any,
    undefined, undefined, undefined, undefined, true,
  );

  const derived = await client.deriveApiKey(0);
  if (derived?.key && derived?.secret && derived?.passphrase) {
    return derived;
  }

  const created = await client.createApiKey(0);
  if (created?.key && created?.secret && created?.passphrase) {
    return created;
  }

  throw new Error('Failed to obtain CLOB API credentials — both derive and create returned invalid results');
}

/** Helper to extract a CLOB error message from the SDK's silent-failure objects */
export function extractClobError(result: any): string | null {
  if (!result) return 'Empty response from CLOB';
  if ('error' in result) {
    const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
    return `CLOB API error (${result.status ?? 'unknown'}): ${errMsg}`;
  }
  if (result.success === false || result.errorMsg) {
    return result.errorMsg || 'CLOB order rejected';
  }
  return null;
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

        const { publicClient } = createClients(chainId, provider);

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
          let prepared = false;
          for (let attempt = 0; attempt < 10; attempt++) {
            raw = await publicClient.readContract({
              address: POLYMARKET_ADDRESSES.BOUNCE,
              abi: BounceAbi,
              functionName: 'getBet',
              args: [BigInt(betView.betId)],
            });
            bet = normalizeBet(raw as Record<string, unknown>);
            if (bet.status === BetStatus.Prepared) {
              prepared = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
          if (!prepared) {
            throw new Error('Prepare confirmed but bet not yet visible as Prepared — please retry in a few seconds');
          }
        }

        const safeAddress = bet.safe as `0x${string}`;
        const tokenId = betView.metadata?.outcomeTokenId;
        if (!tokenId) throw new Error('Missing outcome token ID in bet metadata');

        // Step 2: Verify on-chain that the Safe has USDC balance and allowance
        // (getBalanceAllowance/updateBalanceAllowance don't work for non-Polymarket Safes —
        //  those endpoints don't transmit the Safe address and check a different wallet)
        const negRisk =
          bet.exchange.toLowerCase() === POLYMARKET_ADDRESSES.NEG_RISK_CTF_EXCHANGE.toLowerCase();
        const spender = bet.exchange as `0x${string}`;

        const [onChainBalance, onChainAllowance] = await Promise.all([
          publicClient.readContract({
            address: POLYMARKET_ADDRESSES.USDC,
            abi: ERC20Abi,
            functionName: 'balanceOf',
            args: [safeAddress],
          }),
          publicClient.readContract({
            address: POLYMARKET_ADDRESSES.USDC,
            abi: ERC20Abi,
            functionName: 'allowance',
            args: [safeAddress, spender],
          }),
        ]);

        const requiredUsdc = BigInt(bet.inFlightUSDC);
        console.log(`[on-chain] Safe=${safeAddress} balance=${onChainBalance}, allowance=${onChainAllowance}, required=${requiredUsdc}`);
        if (BigInt(onChainBalance) < requiredUsdc) {
          throw new Error(`Safe USDC balance (${onChainBalance}) is less than required (${requiredUsdc})`);
        }
        if (BigInt(onChainAllowance) < requiredUsdc) {
          throw new Error(`Safe USDC allowance for spender ${spender} (${onChainAllowance}) is less than required (${requiredUsdc})`);
        }

        // Step 3: Derive CLOB API credentials
        setStep('signing');

        const apiCreds = await deriveClobApiCreds(ethersSigner);
        console.log('[CLOB] API creds obtained, apiKey:', apiCreds.key.slice(0, 8) + '...');

        const clobClient = new ClobClient(
          CLOB_HOST,
          POLYGON_CHAIN_ID,
          ethersSigner as any,
          apiCreds,
          GNOSIS_SAFE_SIGNATURE_TYPE,
          safeAddress,
          undefined,
          true,
        );

        // Step 3b: Tell CLOB API to re-index the Safe's on-chain balance/allowance.
        // prepareTrade moved USDC via module execution; the CLOB indexer won't see it
        // until we explicitly trigger a refresh.
        try {
          await clobClient.updateBalanceAllowance({ asset_type: 'COLLATERAL' as any });
          console.log('[CLOB] updateBalanceAllowance (COLLATERAL) succeeded');
        } catch (balErr) {
          console.warn('[CLOB] updateBalanceAllowance failed, proceeding anyway:', balErr);
        }

        // Step 4: Post market order with retry for transient CLOB indexing delays
        setStep('submitting');

        const usdcHuman = Number(bet.inFlightUSDC) / 1_000_000;

        let result: any;
        let lastClobError = '';
        for (let attempt = 0; attempt < 5; attempt++) {
          result = await clobClient.createAndPostMarketOrder({
            tokenID: tokenId,
            amount: usdcHuman,
            side: 'BUY' as any,
            price: 0.99,
          }, {
            tickSize: '0.01',
            negRisk,
          });

          console.log(`[CLOB] postOrder attempt ${attempt}:`, JSON.stringify(result));

          const clobErr = extractClobError(result);
          if (!clobErr) break;

          // Retry on balance/allowance indexing errors
          const isIndexingError = clobErr.toLowerCase().includes('balance') ||
            clobErr.toLowerCase().includes('allowance') ||
            clobErr.toLowerCase().includes('not enough');
          if (isIndexingError && attempt < 4) {
            lastClobError = clobErr;
            console.log(`[CLOB] Retrying in ${3 * (attempt + 1)}s due to indexing delay: ${clobErr}`);
            await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
            continue;
          }

          throw new Error(clobErr);
        }

        const finalErr = extractClobError(result);
        if (finalErr) {
          throw new Error(lastClobError || finalErr);
        }

        const orderId = result.orderID;
        if (!orderId) {
          throw new Error(`No order ID in CLOB response: ${JSON.stringify(result)}`);
        }

        // Step 5: Register order with backend for polling + finalization (with retry)
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await api.post(`/bets/${betView.betId}/register-order`, { orderId }, { authToken });
            break;
          } catch (registerErr) {
            if (attempt === 4) {
              console.error('Failed to register order after retries:', registerErr);
              throw new Error(`Order placed (${orderId}) but failed to register with backend. Please contact support.`);
            }
            await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
          }
        }

        // Step 6: Poll backend trade-status until finalizeTrade completes
        setStep('polling');

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
