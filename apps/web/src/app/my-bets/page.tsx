'use client';

export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Shield, CheckCircle, Loader2, BarChart3 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUserProposals } from '@/hooks/use-proposals';
import type { Proposal } from '@bounce/shared';
import { MyBetCard } from '@/components/polymarket/my-bet-card';
import { EmptyState } from '@/components/empty-state';

type Tab = 'proposed' | 'active' | 'settled';

interface BetEntry {
  proposal: Proposal;
  role: 'believer' | 'backer';
}

export default function MyBetsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('proposed');
  const { isAuthenticated, login, address } = useAuth();
  const { data: proposals, isLoading, error } = useUserProposals(address);

  const entries: BetEntry[] = useMemo(() => {
    if (!proposals || !address) return [];
    return proposals.map((p) => ({
      proposal: p,
      role: p.proposer.toLowerCase() === address.toLowerCase() ? 'believer' as const : 'backer' as const,
    }));
  }, [proposals, address]);

  const proposedEntries = useMemo(
    () => entries.filter((e) => e.proposal.status === 'PROPOSED'),
    [entries]
  );
  const activeEntries = useMemo(
    () => entries.filter((e) => ['FUNDED', 'ORDER_PLACED', 'MATCHED'].includes(e.proposal.status)),
    [entries]
  );
  const settledEntries = useMemo(
    () => entries.filter((e) => e.proposal.status === 'SETTLED'),
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
    { id: 'proposed' as Tab, label: 'Proposed', icon: TrendingUp, count: proposedEntries.length },
    { id: 'active' as Tab, label: 'Active', icon: BarChart3, count: activeEntries.length },
    { id: 'settled' as Tab, label: 'Settled', icon: CheckCircle, count: settledEntries.length },
  ];

  const tabEntries = activeTab === 'proposed'
    ? proposedEntries
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
          Track your proposed, active, and settled Polymarket bets
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
      ) : error && !proposals ? (
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
                    : activeTab === 'active'
                    ? 'No Active Bets'
                    : 'No Settled Bets'
                }
                description={
                  activeTab === 'proposed'
                    ? "You haven't proposed any bets yet. Browse Polymarket events to get started."
                    : activeTab === 'active'
                    ? "You don't have any active bets. Fund a proposal or place an order."
                    : "None of your bets have settled yet."
                }
                actionLabel={activeTab === 'proposed' ? 'Browse Markets' : undefined}
                actionHref={activeTab === 'proposed' ? '/polymarket' : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tabEntries.map((entry, index) => (
                  <motion.div
                    key={entry.proposal.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <MyBetCard proposal={entry.proposal} role={entry.role} />
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
