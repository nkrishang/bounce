'use client';

import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { type Address } from 'viem';
import {
  ensureSafeReady,
  type SafeReadyStep,
} from '@/lib/polymarket-safe';
import { createClients, getWalletAddress } from '@/lib/transaction';

export function useEnsureBounceSafe() {
  const { wallets } = useWallets();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<SafeReadyStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<Address | null>(null);
  const [isReady, setIsReady] = useState(false);

  const ensure = useCallback(async () => {
    const wallet = wallets.find((w) => w.walletClientType === 'privy');
    if (!wallet) throw new Error('No Privy embedded wallet connected');

    setIsLoading(true);
    setError(null);

    try {
      const chainId = 137; // Always Polygon
      await wallet.switchChain(chainId);
      const provider = await wallet.getEthereumProvider();
      const { walletClient, publicClient } = createClients(chainId, provider);
      const address = await getWalletAddress(walletClient);

      const safe = await ensureSafeReady(walletClient, publicClient, address, setStep);
      setSafeAddress(safe);
      setIsReady(true);
      return safe;
    } catch (err) {
      console.error('Ensure safe error:', err);
      setError(err instanceof Error ? err.message : 'Failed to set up Safe');
      setStep('idle');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [wallets]);

  const reset = useCallback(() => {
    setStep('idle');
    setIsLoading(false);
    setError(null);
  }, []);

  return { safeAddress, isReady, isLoading, step, error, ensure, reset };
}
