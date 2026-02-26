'use client';

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ShieldCheck, Inbox } from 'lucide-react';
import { useProposedBets } from '@/hooks/use-proposed-bets';
import { ProposalCard } from './proposal-card';

interface ProposalsDrawerProps {
  open: boolean;
  onClose: () => void;
  conditionId: string;
  marketQuestion: string;
}

export function ProposalsDrawer({ open, onClose, conditionId, marketQuestion }: ProposalsDrawerProps) {
  const { data: allBetViews, isLoading } = useProposedBets();

  const filtered = useMemo(() => {
    if (!allBetViews || !conditionId) return [];
    return allBetViews.filter(
      (bv) => bv.metadata?.conditionId === conditionId,
    );
  }, [allBetViews, conditionId]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-dark-surface border-l border-dark-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-border shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#3090FF] shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white">Active Proposals</h2>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {marketQuestion}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/5 transition-colors shrink-0"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {isLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!isLoading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: 'rgba(97, 166, 251, 0.08)', border: '1px solid rgba(97, 166, 251, 0.15)' }}
                  >
                    <Inbox className="w-6 h-6 text-[#61A6FB]" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">No proposals yet</h3>
                  <p className="text-xs text-muted-foreground max-w-[240px]">
                    There are no active proposals for this market. Be the first to propose a bet using the 3x PROFIT button.
                  </p>
                </div>
              )}

              {!isLoading && filtered.map((betView) => (
                <div key={betView.betId} className="w-full">
                  <ProposalCard betView={betView} fullWidth />
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
