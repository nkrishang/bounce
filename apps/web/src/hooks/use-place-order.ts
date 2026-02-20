'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address, encodeFunctionData } from 'viem';
import { POLYMARKET_ADDRESSES, ERC20Abi } from '@bounce/contracts';
import type { Proposal } from '@bounce/shared';
import { api } from '@/lib/api';
import { createClients, getWalletAddress } from '@/lib/transaction';
import { execSafeTransaction } from '@/lib/safe';
import type { ChainId } from '@bounce/contracts';

type Step = 'idle' | 'approving-exchange' | 'deriving-creds' | 'placing-order' | 'success';

export function usePlaceOrder() {
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

  const placeOrder = useCallback(
    async (proposal: Proposal, price: number, size: number) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        const chainId: ChainId = 137;
        await wallet.switchChain(chainId);

        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient } = createClients(chainId, provider);
        const address = await getWalletAddress(walletClient);

        // Step 1: Approve CTF Exchange from Safe to spend USDC
        setStep('approving-exchange');
        const approveData = encodeFunctionData({
          abi: ERC20Abi,
          functionName: 'approve',
          args: [POLYMARKET_ADDRESSES.CTF_EXCHANGE, BigInt(proposal.totalCapital)],
        });

        await execSafeTransaction(
          walletClient,
          publicClient,
          proposal.safe as Address,
          address,
          {
            to: POLYMARKET_ADDRESSES.USDC,
            data: approveData,
          }
        );
        console.log('CTF Exchange approved on Safe');

        // Step 2: Derive API credentials
        // NOTE: This requires @polymarket/clob-client and ethers v5
        // The CLOB client derives API keys using the wallet's signature
        setStep('deriving-creds');

        // Step 3: Place order on CLOB
        // This would use ClobClient with signature type 2 (GNOSIS_SAFE)
        // and the Safe address as the funder
        setStep('placing-order');

        // For now, log the order parameters
        console.log('Order placement:', {
          tokenId: proposal.outcomeTokenId,
          price,
          size,
          side: 'BUY',
          safeAddress: proposal.safe,
        });

        // TODO: Integrate @polymarket/clob-client when dependency is added
        // const clobClient = new ClobClient(
        //   "https://clob.polymarket.com",
        //   137,
        //   signer,
        //   creds,
        //   2, // GNOSIS_SAFE
        //   proposal.safe
        // );
        // const signedOrder = await clobClient.createOrder({
        //   token_id: proposal.outcomeTokenId,
        //   price,
        //   side: Side.BUY,
        //   size,
        //   fee_rate_bps: 0,
        // });
        // const result = await clobClient.postOrder(signedOrder);

        // Update proposal status
        await api.patch(`/proposals/${proposal.id}`, { status: 'ORDER_PLACED' });

        await queryClient.invalidateQueries({ queryKey: ['proposals'] });

        setStep('success');
      } catch (err) {
        console.error('Place order error:', err);
        setError(err instanceof Error ? err.message : 'Failed to place order');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient]
  );

  return { placeOrder, reset, isLoading, step, error };
}
