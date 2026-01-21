'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { monad } from 'viem/chains';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

function PrivyWrapper({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID || PRIVY_APP_ID === 'your-privy-app-id') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-2xl font-bold mb-4 text-danger">Privy Not Configured</h1>
        <p className="text-muted-foreground max-w-md">
          Please set <code className="px-2 py-1 bg-muted rounded font-mono text-sm">NEXT_PUBLIC_PRIVY_APP_ID</code> in your{' '}
          <code className="px-2 py-1 bg-muted rounded font-mono text-sm">apps/web/.env.local</code> file.
        </p>
        <p className="text-muted-foreground mt-4">
          Get your app ID from{' '}
          <a href="https://dashboard.privy.io" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            dashboard.privy.io
          </a>
        </p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['twitter', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#8b5cf6',
          logo: undefined,
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        defaultChain: monad,
        supportedChains: [monad],
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 1000,
            refetchInterval: 15 * 1000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <PrivyWrapper>{children}</PrivyWrapper>
    </QueryClientProvider>
  );
}
