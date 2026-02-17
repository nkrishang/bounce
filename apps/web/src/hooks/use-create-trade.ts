'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { type Address } from 'viem';
import { TradeEscrowFactoryAbi, ERC20Abi, ADDRESSES_BY_CHAIN, type ChainId } from '@bounce/contracts';
import { TOKENS_BY_CHAIN } from '@bounce/shared';
import { api } from '@/lib/api';
import { sendAndConfirm, createClients, getWalletAddress } from '@/lib/transaction';

type Step = 'idle' | 'approve' | 'confirming-approve' | 'create' | 'confirming' | 'success';

interface CreateTradeParams {
  chainId: ChainId;
  buyToken: Address;
  sellAmount: bigint;
  expirationSeconds: number;
  metadataUri: string;
}

export function useCreateTrade() {
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

  const createTrade = useCallback(
    async (params: CreateTradeParams) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(params.chainId);

        const provider = await wallet.getEthereumProvider();
        const { walletClient, publicClient, chain } = createClients(params.chainId, provider);

        const address = await getWalletAddress(walletClient);

        const factoryAddress = ADDRESSES_BY_CHAIN[params.chainId].TRADE_ESCROW_FACTORY;
        const usdcAddress = TOKENS_BY_CHAIN[params.chainId].USDC;

        // Verify on-chain USDC balance before any transactions
        const usdcBalance = await publicClient.readContract({
          address: usdcAddress,
          abi: ERC20Abi,
          functionName: 'balanceOf',
          args: [address],
        });

        if (usdcBalance < params.sellAmount) {
          throw new Error('Insufficient USDC balance');
        }

        // Check existing allowance to skip redundant approval
        const existingAllowance = await publicClient.readContract({
          address: usdcAddress,
          abi: ERC20Abi,
          functionName: 'allowance',
          args: [address, factoryAddress],
        });

        if (existingAllowance < params.sellAmount) {
          setStep('approve');
          const { hash: approveHash } = await sendAndConfirm(
            publicClient,
            () =>
              walletClient.writeContract({
                chain,
                address: usdcAddress,
                abi: ERC20Abi,
                functionName: 'approve',
                args: [factoryAddress, params.sellAmount],
                account: address,
              }),
          );
          console.log('Approve tx confirmed:', approveHash);
        } else {
          console.log('Sufficient USDC allowance already exists, skipping approval');
        }

        setStep('create');
        const expirationTimestamp = BigInt(Math.floor(Date.now() / 1000) + params.expirationSeconds);

        setStep('confirming');
        const { hash: createHash } = await sendAndConfirm(
          publicClient,
          () =>
            walletClient.writeContract({
              chain,
              address: factoryAddress,
              abi: TradeEscrowFactoryAbi,
              functionName: 'createTradeEscrow',
              args: [
                expirationTimestamp,
                usdcAddress,
                params.buyToken,
                params.sellAmount,
                params.metadataUri,
              ],
              account: address,
            }),
        );

        console.log('Create tx confirmed:', createHash);

        await api.post('/trades/refresh', { chainId: params.chainId }).catch(() => {});

        await queryClient.invalidateQueries({ queryKey: ['trades'] });
        await queryClient.invalidateQueries({ queryKey: ['userTrades'] });

        setStep('success');
        return createHash;
      } catch (err) {
        console.error('Create trade error:', err);
        setError(err instanceof Error ? err.message : 'Failed to create trade');
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient]
  );

  return {
    createTrade,
    reset,
    isLoading,
    step,
    error,
  };
}
