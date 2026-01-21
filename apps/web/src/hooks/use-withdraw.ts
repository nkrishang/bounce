'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { createWalletClient, custom, type Address } from 'viem';
import { monad } from 'viem/chains';
import { TradeEscrowAbi } from '@escape/contracts';

export function useWithdraw() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdrawProposer = useCallback(
    async (escrowAddress: Address) => {
      const wallet = wallets[0];
      if (!wallet) throw new Error('No wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: monad,
          transport: custom(provider),
        });

        const [address] = await walletClient.getAddresses();

        const hash = await walletClient.writeContract({
          address: escrowAddress,
          abi: TradeEscrowAbi,
          functionName: 'withdrawProposer',
          account: address,
        });

        console.log('Withdraw proposer tx:', hash);

        await queryClient.invalidateQueries({ queryKey: ['trades'] });
        await queryClient.invalidateQueries({ queryKey: ['userTrades'] });
        await queryClient.invalidateQueries({ queryKey: ['trade', escrowAddress] });
        await queryClient.invalidateQueries({ queryKey: ['walletBalance'] });

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
    async (escrowAddress: Address) => {
      const wallet = wallets[0];
      if (!wallet) throw new Error('No wallet connected');

      setIsLoading(true);
      setError(null);

      try {
        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: monad,
          transport: custom(provider),
        });

        const [address] = await walletClient.getAddresses();

        const hash = await walletClient.writeContract({
          address: escrowAddress,
          abi: TradeEscrowAbi,
          functionName: 'withdrawFunder',
          account: address,
        });

        console.log('Withdraw funder tx:', hash);

        await queryClient.invalidateQueries({ queryKey: ['trades'] });
        await queryClient.invalidateQueries({ queryKey: ['userTrades'] });
        await queryClient.invalidateQueries({ queryKey: ['trade', escrowAddress] });
        await queryClient.invalidateQueries({ queryKey: ['walletBalance'] });

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
