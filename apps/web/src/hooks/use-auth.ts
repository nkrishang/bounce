'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useMemo } from 'react';
import { type Address } from 'viem';

export function useAuth() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWalletAddress = useMemo(() => {
    if (!authenticated || !wallets.length) return undefined;
    const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
    return embeddedWallet?.address as Address | undefined;
  }, [authenticated, wallets]);

  const linkedExternalWalletAddress = useMemo(() => {
    if (!authenticated || !user) return undefined;
    const linkedWallet = user.linkedAccounts?.find(
      (account) => account.type === 'wallet' && account.walletClientType !== 'privy'
    );
    return linkedWallet && 'address' in linkedWallet
      ? (linkedWallet.address as Address)
      : undefined;
  }, [authenticated, user]);

  const primaryAddress = useMemo(() => {
    return embeddedWalletAddress ?? linkedExternalWalletAddress;
  }, [embeddedWalletAddress, linkedExternalWalletAddress]);

  return {
    isReady: ready,
    isAuthenticated: ready && authenticated,
    login,
    logout,
    user,
    address: primaryAddress,
    embeddedWalletAddress,
    externalWalletAddress: linkedExternalWalletAddress,
    wallets,
    walletsLoading: !primaryAddress && authenticated,
  };
}
