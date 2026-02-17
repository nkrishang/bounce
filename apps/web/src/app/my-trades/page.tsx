'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, TrendingUp, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUserTrades } from '@/hooks/use-trades';
import { type TradeView } from '@bounce/shared';
import { MyTradeCard } from '@/components/my-trade-card';
import { EmptyState } from '@/components/empty-state';

type Tab = 'proposed' | 'active' | 'sold';

function normalizeTab(tabParam: string | null): Tab {
  if (tabParam === 'funded') return 'active';
  if (tabParam === 'active' || tabParam === 'sold' || tabParam === 'proposed') return tabParam;
  return 'proposed';
}

interface UserTradeEntry {
  trade: TradeView;
  role: 'proposer' | 'funder';
}

export default function MyTradesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tab = searchParams.get('tab');
  const initialTab = normalizeTab(tab);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [isRedirectPolling, setIsRedirectPolling] = useState(false);
  const { isAuthenticated, login, address } = useAuth();
  const { data: userTrades, isLoading, isFetching, error } = useUserTrades(address);

  useEffect(() => {
    setActiveTab(normalizeTab(searchParams.get('tab')));
  }, [searchParams]);

  const onTabClick = (tabId: Tab) => {
    setActiveTab(tabId);
    router.replace(`/my-trades?tab=${tabId}`);
  };

  // Aggressively refetch for a short period when arriving from a transaction redirect
  const hasPolled = useRef(false);
  useEffect(() => {
    if (!tab || hasPolled.current || !address) return;
    hasPolled.current = true;
    setIsRedirectPolling(true);

    const interval = setInterval(() => {
      queryClient.refetchQueries({ queryKey: ['userTrades', address] });
    }, 2000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setIsRedirectPolling(false);
    }, 12000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [tab, address, queryClient]);

  // Merge trades from both roles and categorize by status
  const entries: UserTradeEntry[] = useMemo(() => {
    const proposer = (userTrades?.asProposer ?? []).map(trade => ({ trade, role: 'proposer' as const }));
    const funder = (userTrades?.asFunder ?? []).map(trade => ({ trade, role: 'funder' as const }));

    const seen = new Set<string>();
    return [...proposer, ...funder].filter(e => {
      const key = `${e.trade.chainId}:${e.trade.escrow}:${e.role}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [userTrades]);

  const proposedEntries = useMemo(
    () => entries.filter(e => e.trade.status === 'OPEN' || e.trade.status === 'EXPIRED_UNFUNDED'),
    [entries]
  );
  const activeEntries = useMemo(
    () => entries.filter(e => e.trade.status === 'FUNDED'),
    [entries]
  );
  const soldEntries = useMemo(
    () => entries.filter(e => e.trade.status === 'SOLD'),
    [entries]
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h2 className="text-2xl font-bold">Connect to View Your Trades</h2>
          <p className="text-muted-foreground">Sign in to see your trades.</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={login}
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            Sign In
          </motion.button>
        </motion.div>
      </div>
    );
  }

  const tabs = [
    { id: 'proposed' as Tab, label: 'Proposed', icon: Briefcase, count: proposedEntries.length },
    { id: 'active' as Tab, label: 'Active', icon: TrendingUp, count: activeEntries.length },
    { id: 'sold' as Tab, label: 'Sold', icon: CheckCircle, count: soldEntries.length },
  ];

  const tabEntries = activeTab === 'proposed'
    ? proposedEntries
    : activeTab === 'active'
    ? activeEntries
    : soldEntries;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">My Trades</h1>
          {isFetching && !isLoading && (
            <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-muted-foreground mt-2">
          Manage your proposed, active, and sold trades
        </p>
      </motion.div>

      <div className="flex gap-2 mb-8">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabClick(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === t.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            <span className="text-xs px-2 py-0.5 rounded-full bg-black/20">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : error && !userTrades ? (
        <div className="text-center py-20 text-danger">
          Failed to load trades. Please try again.
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {tabEntries.length === 0 ? (
              isRedirectPolling ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">
                    {activeTab === 'proposed'
                      ? 'Fetching your proposed trade…'
                      : activeTab === 'active'
                      ? 'Fetching your active trade…'
                      : 'Fetching your sold trade…'}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This can take a few seconds to appear. We&apos;ll refresh automatically.
                  </p>
                </div>
              ) : (
                <EmptyState
                  title={
                    activeTab === 'proposed'
                      ? 'No Proposed Trades'
                      : activeTab === 'active'
                      ? 'No Active Trades'
                      : 'No Sold Trades'
                  }
                  description={
                    activeTab === 'proposed'
                      ? "You haven't proposed any trades yet. Create one to get started."
                      : activeTab === 'active'
                      ? "You don't have any active trades. Browse open trades to invest."
                      : "You haven't sold any trades yet."
                  }
                  actionLabel={
                    activeTab === 'proposed'
                      ? 'Create Trade'
                      : activeTab === 'active'
                      ? 'Browse Trades'
                      : undefined
                  }
                  actionHref={
                    activeTab === 'proposed'
                      ? '/create-trade'
                      : activeTab === 'active'
                      ? '/'
                      : undefined
                  }
                />
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tabEntries.map((entry, index) => (
                  <motion.div
                    key={`${entry.trade.escrow}-${entry.role}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <MyTradeCard
                      trade={entry.trade}
                      role={entry.role}
                      tab={activeTab}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
