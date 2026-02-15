'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { createWalletClient, custom, type Address } from 'viem';
import { TradeEscrowFactoryAbi, ERC20Abi, getChain, ADDRESSES_BY_CHAIN, type ChainId } from '@thesis/contracts';
import { TOKENS_BY_CHAIN } from '@thesis/shared';

type Step = 'idle' | 'approve' | 'create' | 'confirming' | 'success';

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

  const createTrade = useCallback(
    async (params: CreateTradeParams) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(params.chainId);

        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: getChain(params.chainId),
          transport: custom(provider),
        });

        const factoryAddress = ADDRESSES_BY_CHAIN[params.chainId].TRADE_ESCROW_FACTORY;
        const usdcAddress = TOKENS_BY_CHAIN[params.chainId].USDC;

        const [address] = await walletClient.getAddresses();

        setStep('approve');
        const approveHash = await walletClient.writeContract({
          address: usdcAddress,
          abi: ERC20Abi,
          functionName: 'approve',
          args: [factoryAddress, params.sellAmount],
          account: address,
        });

        console.log('Approve tx:', approveHash);

        setStep('create');
        const expirationTimestamp = BigInt(Math.floor(Date.now() / 1000) + params.expirationSeconds);

        const createHash = await walletClient.writeContract({
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
        });

        console.log('Create tx:', createHash);

        setStep('confirming');
        await queryClient.invalidateQueries({ queryKey: ['trades'] });
        await queryClient.invalidateQueries({ queryKey: ['userTrades'] });

        setStep('success');
        return createHash;
      } catch (err) {
        console.error('Create trade error:', err);
        setError(err instanceof Error ? err.message : 'Failed to create trade');
        setIsLoading(false);
        setStep('idle');
        throw err;
      }
    },
    [wallets, queryClient]
  );

  return {
    createTrade,
    isLoading,
    step,
    error,
  };
}
