'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useTrades } from '@/hooks/use-trades';
import { TradeCard } from './trade-card';
import { EmptyState } from './empty-state';

export function TradeGrid() {
  const { data: trades, isLoading, error } = useTrades({ status: 'OPEN' });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 text-danger">
        Failed to load trades. Please try again.
      </div>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <EmptyState
        title="No Open Trades"
        description="Be the first to propose a trade and invite funders to co-invest with you."
        actionLabel="Create Trade"
        actionHref="/create-trade"
      />
    );
  }

  return (
    <div className="grid gap-4">
      <AnimatePresence mode="popLayout">
        {trades.map((trade, index) => (
          <motion.div
            key={trade.escrow}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.05 }}
            layout
          >
            <TradeCard trade={trade} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
