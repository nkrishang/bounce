'use client';

export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Shield, CheckCircle, Loader2, BarChart3, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useMyBets } from '@/hooks/use-bets';
import { BetStatus } from '@bounce/shared';
import type { BetView } from '@bounce/shared';
import { MyBetCard } from '@/components/polymarket/my-bet-card';
import { EmptyState } from '@/components/empty-state';

type Tab = 'proposed' | 'funded' | 'active' | 'settled';

interface BetEntry {
  betView: BetView;
  role: 'believer' | 'backer';
}

const VALID_TABS: Tab[] = ['proposed', 'funded', 'active', 'settled'];

export default function MyBetsPage() {
  const searchParams = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get('tab') as Tab)
    ? (searchParams.get('tab') as Tab)
    : 'proposed';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const { isAuthenticated, login, address } = useAuth();
  const { data: betViews, isLoading, error } = useMyBets(address as `0x${string}` | undefined);

  const entries: BetEntry[] = useMemo(() => {
    if (!betViews || !address) return [];
    return betViews.map((bv) => ({
      betView: bv,
      role: bv.bet.proposer.toLowerCase() === address.toLowerCase() ? 'believer' as const : 'backer' as const,
    }));
  }, [betViews, address]);

  const proposedEntries = useMemo(
    () => entries.filter((e) => e.betView.bet.status === BetStatus.Proposed),
    [entries]
  );
  const fundedEntries = useMemo(
    () => entries.filter((e) => e.betView.bet.status === BetStatus.Funded || e.betView.bet.status === BetStatus.Prepared),
    [entries]
  );
  const activeEntries = useMemo(
    () => entries.filter((e) => e.betView.bet.status === BetStatus.Traded),
    [entries]
  );
  const settledEntries = useMemo(
    () => entries.filter((e) => [BetStatus.Closed, BetStatus.Withdrawn, BetStatus.Cancelled].includes(e.betView.bet.status)),
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
          <h2 className="text-2xl font-bold">Connect to View Your Bets</h2>
          <p className="text-muted-foreground">Sign in to see your Polymarket bets.</p>
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
    { id: 'proposed' as Tab, label: 'Proposed', icon: Clock, count: proposedEntries.length },
    { id: 'funded' as Tab, label: 'Funded', icon: Shield, count: fundedEntries.length },
    { id: 'active' as Tab, label: 'Active', icon: BarChart3, count: activeEntries.length },
    { id: 'settled' as Tab, label: 'Settled', icon: CheckCircle, count: settledEntries.length },
  ];

  const tabEntries = activeTab === 'proposed'
    ? proposedEntries
    : activeTab === 'funded'
    ? fundedEntries
    : activeTab === 'active'
    ? activeEntries
    : settledEntries;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">My Bets</h1>
          <span
            className="inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
            style={{
              color: '#8b5cf6',
              borderColor: 'rgba(139, 92, 246, 0.3)',
              background: 'rgba(139, 92, 246, 0.08)',
            }}
          >
            Polymarket
          </span>
        </div>
        <p className="text-muted-foreground mt-2">
          Track your proposed, funded, active, and settled Polymarket bets
        </p>
      </motion.div>

      <div className="flex gap-1.5 sm:gap-2 mb-8">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-all ${
              activeTab === t.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-4 h-4 hidden sm:block" />
            {t.label}
            <span className="text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-black/20">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : error && !betViews ? (
        <div className="text-center py-20 text-danger">
          Failed to load bets. Please try again.
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
              <EmptyState
                title={
                  activeTab === 'proposed'
                    ? 'No Proposed Bets'
                    : activeTab === 'funded'
                    ? 'No Funded Bets'
                    : activeTab === 'active'
                    ? 'No Active Bets'
                    : 'No Settled Bets'
                }
                description={
                  activeTab === 'proposed'
                    ? "You haven't proposed any bets yet. Browse Polymarket events to get started."
                    : activeTab === 'funded'
                    ? "You don't have any funded bets awaiting trade execution."
                    : activeTab === 'active'
                    ? "You don't have any active bets."
                    : "None of your bets have settled yet."
                }
                actionLabel={activeTab === 'proposed' ? 'Browse Markets' : undefined}
                actionHref={activeTab === 'proposed' ? '/polymarket' : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tabEntries.map((entry, index) => (
                  <motion.div
                    key={entry.betView.betId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <MyBetCard betView={entry.betView} role={entry.role} />
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
