'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useMemo } from 'react';
import { type Address } from 'viem';

export function useAuth() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  const address = useMemo(() => {
    if (!authenticated || !wallets.length) return undefined;
    const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
    const address = embeddedWallet?.address || wallets[0]?.address;
    return address as Address | undefined;
  }, [authenticated, wallets]);

  return {
    isReady: ready,
    isAuthenticated: authenticated,
    login,
    logout,
    user,
    address,
    wallets,
  };
}
