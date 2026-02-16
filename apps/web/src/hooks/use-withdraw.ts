'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { createWalletClient, createPublicClient, custom, http, type Address } from 'viem';
import { TradeEscrowAbi, getChain, type ChainId } from '@thesis/contracts';

const RPC_URLS: Record<number, string> = {
  137: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || '',
  8453: process.env.NEXT_PUBLIC_BASE_RPC_URL || '',
  143: process.env.NEXT_PUBLIC_MONAD_RPC_URL || '',
};
import { patchTradeInCache } from '@/lib/trade-cache';

export function useWithdraw() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdrawProposer = useCallback(
    async (chainId: ChainId, escrowAddress: Address) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(chainId);

        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: getChain(chainId),
          transport: custom(provider),
        });

        const publicClient = createPublicClient({
          chain: getChain(chainId),
          transport: http(RPC_URLS[chainId] || undefined),
        });

        const [address] = await walletClient.getAddresses();

        const hash = await walletClient.writeContract({
          address: escrowAddress,
          abi: TradeEscrowAbi,
          functionName: 'withdrawProposer',
          account: address,
        });

        console.log('Withdraw proposer tx:', hash);
        await publicClient.waitForTransactionReceipt({ hash });

        const stopGuard = patchTradeInCache(queryClient, escrowAddress, (trade) => ({
          ...trade,
          canWithdrawProposer: false,
          state: {
            ...trade.state,
            withdrawProposerPerformed: true,
          },
        }));

        // Delay invalidation so the API cache (15s TTL) has expired
        // and refetch returns fresh data instead of overwriting the optimistic patch.
        setTimeout(() => {
          stopGuard();
          queryClient.invalidateQueries({ queryKey: ['trades'] });
          queryClient.invalidateQueries({ queryKey: ['userTrades'] });
          queryClient.invalidateQueries({ queryKey: ['trade', escrowAddress] });
          queryClient.invalidateQueries({ queryKey: ['walletBalance'] });
        }, 16000);

        return hash;
      } catch (err) {
        console.error('Withdraw proposer error:', err);
        setError(err instanceof Error ? err.message : 'Failed to withdraw');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient]
  );

  const withdrawFunder = useCallback(
    async (chainId: ChainId, escrowAddress: Address) => {
      const wallet = wallets.find((w) => w.walletClientType === 'privy');
      if (!wallet) throw new Error('No Privy embedded wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(chainId);

        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: getChain(chainId),
          transport: custom(provider),
        });

        const publicClient = createPublicClient({
          chain: getChain(chainId),
          transport: http(RPC_URLS[chainId] || undefined),
        });

        const [address] = await walletClient.getAddresses();

        const hash = await walletClient.writeContract({
          address: escrowAddress,
          abi: TradeEscrowAbi,
          functionName: 'withdrawFunder',
          account: address,
        });

        console.log('Withdraw funder tx:', hash);
        await publicClient.waitForTransactionReceipt({ hash });

        const stopGuard = patchTradeInCache(queryClient, escrowAddress, (trade) => ({
          ...trade,
          canWithdrawFunder: false,
          state: {
            ...trade.state,
            withdrawFunderPerformed: true,
          },
        }));

        setTimeout(() => {
          stopGuard();
          queryClient.invalidateQueries({ queryKey: ['trades'] });
          queryClient.invalidateQueries({ queryKey: ['userTrades'] });
          queryClient.invalidateQueries({ queryKey: ['trade', escrowAddress] });
          queryClient.invalidateQueries({ queryKey: ['walletBalance'] });
        }, 16000);

        return hash;
      } catch (err) {
        console.error('Withdraw funder error:', err);
        setError(err instanceof Error ? err.message : 'Failed to withdraw');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallets, queryClient]
  );

  return {
    withdrawProposer,
    withdrawFunder,
    isLoading,
    error,
  };
}
