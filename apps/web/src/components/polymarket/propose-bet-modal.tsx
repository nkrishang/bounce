'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Shield, Loader2, Check, AlertTriangle } from 'lucide-react';
import type { PolymarketEvent, PolymarketMarket } from '@bounce/shared';
import { useAuth } from '@/hooks/use-auth';
import { useCreateThesis } from '@/hooks/use-create-thesis';
import { formatUnits, parseUnits } from 'viem';

interface ProposeBetModalProps {
  open: boolean;
  onClose: () => void;
  event: PolymarketEvent | null;
  market: PolymarketMarket | null;
  tokenId: string;
  outcome: string;
  price: number;
}

export function ProposeBetModal({ open, onClose, event, market, tokenId, outcome, price }: ProposeBetModalProps) {
  const { isAuthenticated, login, address } = useAuth();
  const { createThesis, isLoading, step, error, reset } = useCreateThesis();
  const [stakeAmount, setStakeAmount] = useState('10');

  useEffect(() => {
    if (!open) {
      reset();
      setStakeAmount('10');
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

  const stakeNum = parseFloat(stakeAmount) || 0;
  const totalPosition = stakeNum * 5;
  const funderPortion = stakeNum * 4;
  const pct = Math.round(price * 100);

  const handlePropose = async () => {
    if (!market || !event || stakeNum < 1) return;
    try {
      const contribution = parseUnits(stakeAmount, 6);
      await createThesis({
        conditionId: market.condition_id,
        outcomeTokenId: tokenId,
        isYesOutcome: outcome.toLowerCase() === 'yes',
        proposerContribution: contribution,
        marketSlug: event.slug,
        marketQuestion: market.question || event.title,
        marketImage: event.image,
        outcomePrice: price.toString(),
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (!open || !event || !market) return null;

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
                  {event.image && (
                    <img src={event.image} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/5" />
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-white">{market.question || event.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold"
                        style={{
                          background: outcome.toLowerCase() === 'yes' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: outcome.toLowerCase() === 'yes' ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {outcome}
                      </span>
                      <span className="text-sm text-muted-foreground font-mono">{pct}¢</span>
                    </div>
                  </div>
                </div>

                {/* Stake Input */}
                <div className="rounded-xl border border-dark-border p-4">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    Your Stake (20%)
                  </label>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-lg text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="flex-1 bg-transparent text-2xl font-mono font-bold text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="10"
                    />
                    <span className="text-sm text-muted-foreground font-medium">USDC</span>
                  </div>
                  {stakeNum < 1 && stakeAmount !== '' && (
                    <p className="text-xs text-danger mt-1">Minimum stake is $1 USDC</p>
                  )}
                </div>

                {/* Position Breakdown */}
                <div className="rounded-xl border border-dark-border overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your Stake (Believer 20%)</span>
                      <span className="font-mono" style={{ color: '#D4AD4A' }}>${stakeNum.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Funder Portion (Backer 80%)</span>
                      <span className="font-mono" style={{ color: '#61A6FB' }}>${funderPortion.toLocaleString()}</span>
                    </div>
                    <div className="h-px bg-dark-border" />
                    <div className="flex justify-between font-semibold">
                      <span className="text-white">Total Position</span>
                      <span className="font-mono text-white">${totalPosition.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Profit/Loss info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#111113] border border-dark-border">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4" style={{ color: '#D4AD4A' }} />
                      <span className="text-sm font-semibold" style={{ color: '#D4AD4A' }}>If Profit</span>
                    </div>
                    <p className="text-xs text-muted-foreground">You earn 60% of gains</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#111113] border border-dark-border">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-danger" />
                      <span className="text-sm font-semibold text-danger">If Loss</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Your 20% absorbs losses first</p>
                  </div>
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
                      background: 'rgba(236, 194, 94, 0.12)',
                      border: '1px solid rgba(236, 194, 94, 0.3)',
                      color: '#C8A93E',
                    }}
                  >
                    Sign In to Propose
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={!isLoading && step !== 'success' ? { scale: 1.01 } : {}}
                    whileTap={!isLoading && step !== 'success' ? { scale: 0.99 } : {}}
                    onClick={handlePropose}
                    disabled={isLoading || step === 'success' || stakeNum < 1}
                    className="w-full py-4 rounded-xl font-bold text-[15px] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-200"
                    style={
                      step === 'success'
                        ? { background: '#22c55e', color: 'white' }
                        : {
                            background: 'rgba(236, 194, 94, 0.12)',
                            border: '1px solid rgba(236, 194, 94, 0.3)',
                            color: '#C8A93E',
                          }
                    }
                  >
                    {step === 'success' ? (
                      <><Check className="w-5 h-5" /> Bet Proposed!</>
                    ) : isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {step === 'deploying-safe' && 'Deploying Safe...'}
                        {step === 'deploying-guard' && 'Deploying Guard...'}
                        {step === 'setting-guard' && 'Setting Guard...'}
                        {step === 'approving' && 'Approving USDC...'}
                        {step === 'transferring' && 'Transferring USDC...'}
                        {step === 'registering' && 'Registering...'}
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-5 h-5" />
                        Propose Bet — ${stakeNum.toLocaleString()} USDC
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
