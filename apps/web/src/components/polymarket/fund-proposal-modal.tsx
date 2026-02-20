'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, TrendingUp, Loader2, Check, AlertTriangle } from 'lucide-react';
import type { Proposal } from '@bounce/shared';
import { formatAddress } from '@bounce/shared';
import { formatUnits } from 'viem';
import { useAuth } from '@/hooks/use-auth';
import { useFundThesis } from '@/hooks/use-fund-thesis';

interface FundProposalModalProps {
  proposal: Proposal;
  open: boolean;
  onClose: () => void;
}

export function FundProposalModal({ proposal, open, onClose }: FundProposalModalProps) {
  const { isAuthenticated, login } = useAuth();
  const { fundThesis, isLoading, step, error, reset } = useFundThesis();

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [open, reset]);

  const proposerStake = formatUnits(BigInt(proposal.proposerContribution), 6);
  const totalPosition = formatUnits(BigInt(proposal.totalCapital), 6);
  const funderPortion = parseFloat(totalPosition) - parseFloat(proposerStake);
  const pct = proposal.outcomePrice ? Math.round(parseFloat(proposal.outcomePrice) * 100) : 50;

  const handleFund = async () => {
    try {
      await fundThesis(proposal);
    } catch (err) {
      console.error(err);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="relative bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-10 p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>

              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start gap-4">
                  {proposal.marketImage && (
                    <img src={proposal.marketImage} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/5" />
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-white">{proposal.marketQuestion || 'Fund Bet'}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold"
                        style={{
                          background: proposal.isYesOutcome ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: proposal.isYesOutcome ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {proposal.isYesOutcome ? 'Yes' : 'No'}
                      </span>
                      <span className="text-sm text-muted-foreground font-mono">{pct}¢</span>
                      <span className="text-xs text-muted-foreground">by {formatAddress(proposal.proposer)}</span>
                    </div>
                  </div>
                </div>

                {/* Funding Breakdown */}
                <div className="rounded-xl border border-dark-border overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Believer Stake (20%)</span>
                      <span className="font-mono" style={{ color: '#D4AD4A' }}>${parseFloat(proposerStake).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your Funding (80%)</span>
                      <span className="font-mono font-semibold" style={{ color: '#61A6FB' }}>${funderPortion.toLocaleString()}</span>
                    </div>
                    <div className="h-px bg-dark-border" />
                    <div className="flex justify-between font-semibold">
                      <span className="text-white">Total Position</span>
                      <span className="font-mono text-white">${parseFloat(totalPosition).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Outcome scenarios */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#111113] border border-dark-border">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-success" />
                      <span className="text-sm font-semibold text-success">If Profit</span>
                    </div>
                    <p className="text-xs text-muted-foreground">You receive 40% of gains</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#111113] border border-dark-border">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4" style={{ color: '#61A6FB' }} />
                      <span className="text-sm font-semibold" style={{ color: '#61A6FB' }}>If Loss</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Believer absorbs first 20%</p>
                  </div>
                </div>

                {/* Warning */}
                <div className="p-3 rounded-xl bg-warning/5 border border-warning/15 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    This will transfer USDC to the Safe and create the thesis on-chain.
                  </p>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-danger/10 border border-danger/20">
                    <p className="text-xs text-danger">{error}</p>
                  </div>
                )}

                {/* CTA */}
                {!isAuthenticated ? (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={login}
                    className="w-full py-4 rounded-xl font-bold text-[15px] transition-all duration-200"
                    style={{
                      background: 'rgba(97, 166, 251, 0.12)',
                      border: '1px solid rgba(97, 166, 251, 0.3)',
                      color: '#61A6FB',
                    }}
                  >
                    Sign In to Fund
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={!isLoading && step !== 'success' ? { scale: 1.01 } : {}}
                    whileTap={!isLoading && step !== 'success' ? { scale: 0.99 } : {}}
                    onClick={handleFund}
                    disabled={isLoading || step === 'success'}
                    className="w-full py-4 rounded-xl font-bold text-[15px] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-200"
                    style={
                      step === 'success'
                        ? { background: '#22c55e', color: 'white' }
                        : {
                            background: 'rgba(97, 166, 251, 0.12)',
                            border: '1px solid rgba(97, 166, 251, 0.3)',
                            color: '#61A6FB',
                          }
                    }
                  >
                    {step === 'success' ? (
                      <><Check className="w-5 h-5" /> Bet Funded!</>
                    ) : isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {step === 'approving' && 'Approving USDC...'}
                        {step === 'transferring' && 'Transferring USDC...'}
                        {step === 'creating-thesis' && 'Creating Thesis...'}
                        {step === 'updating' && 'Finalizing...'}
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5" />
                        Fund ${funderPortion.toLocaleString()} USDC
                      </>
                    )}
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
