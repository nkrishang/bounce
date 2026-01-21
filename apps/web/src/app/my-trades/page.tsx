'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, TrendingUp, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUserTrades } from '@/hooks/use-trades';
import { TradeRow } from '@/components/trade-row';
import { EmptyState } from '@/components/empty-state';

type Tab = 'proposed' | 'funded';

export default function MyTradesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('proposed');
  const { isAuthenticated, login, address } = useAuth();
  const { data: userTrades, isLoading, error } = useUserTrades(address);

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h2 className="text-2xl font-bold">Connect to View Your Trades</h2>
          <p className="text-muted-foreground">Sign in to see trades you&apos;ve proposed or funded.</p>
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
    { id: 'proposed' as Tab, label: 'Proposed', icon: Briefcase },
    { id: 'funded' as Tab, label: 'Funded', icon: TrendingUp },
  ];

  const currentTrades = activeTab === 'proposed' 
    ? userTrades?.asProposer ?? [] 
    : userTrades?.asFunder ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold">My Trades</h1>
        <p className="text-muted-foreground mt-2">
          Manage your proposed and funded trades
        </p>
      </motion.div>

      <div className="flex gap-2 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            <span className="text-xs px-2 py-0.5 rounded-full bg-black/20">
              {tab.id === 'proposed'
                ? userTrades?.asProposer?.length ?? 0
                : userTrades?.asFunder?.length ?? 0}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
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
            className="space-y-4"
          >
            {currentTrades.length === 0 ? (
              <EmptyState
                title={activeTab === 'proposed' ? 'No Proposed Trades' : 'No Funded Trades'}
                description={
                  activeTab === 'proposed'
                    ? "You haven't proposed any trades yet. Create one to get started."
                    : "You haven't funded any trades yet. Browse open trades to invest."
                }
                actionLabel={activeTab === 'proposed' ? 'Create Trade' : 'Browse Trades'}
                actionHref={activeTab === 'proposed' ? '/create-trade' : '/'}
              />
            ) : (
              currentTrades.map((trade, index) => (
                <motion.div
                  key={trade.escrow}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <TradeRow
                    trade={trade}
                    role={activeTab === 'proposed' ? 'proposer' : 'funder'}
                  />
                </motion.div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
