'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Shield, Loader2, Check, Minus, Plus } from 'lucide-react';
import type { PolymarketEvent, PolymarketMarket } from '@bounce/shared';
import { useAuth } from '@/hooks/use-auth';
import { useProposeBet } from '@/hooks/use-propose-bet';
import { parseUnits } from 'viem';
import {
  computeProfitComparison,
  computeWipeoutPrice,
  DEFAULT_PROPOSER_CAPITAL_BPS,
  DEFAULT_PROPOSER_PROFIT_SHARE_BPS,
} from '@/lib/bet-math';

const MIN_STAKE = 10;
const PRESETS = [10, 25, 50, 100];

interface ProposeBetModalProps {
  open: boolean;
  onClose: () => void;
  event: PolymarketEvent | null;
  market: PolymarketMarket | null;
  tokenId: string;
  outcome: string;
  price: number;
  outcomeIndex: number;
}

export function ProposeBetModal({ open, onClose, event, market, tokenId, outcome, price, outcomeIndex }: ProposeBetModalProps) {
  const { isAuthenticated, login, address } = useAuth();
  const { proposeBet, isLoading, step, error, reset } = useProposeBet();
  const [stakeAmount, setStakeAmount] = useState(String(MIN_STAKE));

  useEffect(() => {
    if (!open) {
      reset();
      setStakeAmount(String(MIN_STAKE));
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
  const isValidStake = stakeNum >= MIN_STAKE;
  const totalPosition = stakeNum * (10000 / DEFAULT_PROPOSER_CAPITAL_BPS);
  const funderPortion = totalPosition - stakeNum;
  const pct = Math.round(price * 100);

  const profitComparison = price > 0 && isValidStake ? computeProfitComparison(stakeNum, price) : null;
  const wipeoutPrice = price > 0 ? computeWipeoutPrice(price) : 0;

  const adjustStake = useCallback((delta: number) => {
    setStakeAmount((prev) => {
      const current = parseFloat(prev) || 0;
      const next = Math.max(MIN_STAKE, current + delta);
      return String(next);
    });
  }, []);

  const handlePropose = async () => {
    if (!market || !event || !isValidStake) return;
    try {
      const stakeAmountBigint = parseUnits(stakeAmount, 6);
      await proposeBet({
        conditionId: market.conditionId || market.condition_id,
        outcomeIndex,
        outcomeTokenId: tokenId,
        isYesOutcome: outcome.toLowerCase() === 'yes',
        stakeAmount: stakeAmountBigint,
        marketSlug: event.slug,
        marketQuestion: market.question || event.title,
        marketImage: event.image,
        outcomePrice: price.toString(),
        negRisk: market.negRisk,
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (!open || !event || !market) return null;

  const proposerPct = DEFAULT_PROPOSER_CAPITAL_BPS / 100;
  const backerPct = 100 - proposerPct;

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
            <div className="relative bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-md max-h-[90vh] overflow-y-auto">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-10 p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>

              {/* Header — compact row */}
              <div className="px-5 pt-5 pb-4 flex items-center gap-3">
                {event.image && (
                  <img src={event.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-white leading-snug line-clamp-2 pr-8">
                    {market.question || event.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold"
                      style={{
                        background: outcome.toLowerCase() === 'yes' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: outcome.toLowerCase() === 'yes' ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {outcome}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{pct}¢</span>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* ── Bet Amount ── */}
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    Your Stake ({proposerPct}%)
                  </label>

                  {/* Stepper input */}
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => adjustStake(-5)}
                      disabled={stakeNum <= MIN_STAKE}
                      className="shrink-0 w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-5 h-5" />
                    </button>

                    <div className="flex-1 relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-2xl font-medium pointer-events-none">$</span>
                      <input
                        type="number"
                        min={MIN_STAKE}
                        step="1"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl h-14 pl-10 pr-20 text-3xl font-mono font-bold text-white text-center outline-none focus:border-[#D4AD4A]/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">USDC</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => adjustStake(5)}
                      className="shrink-0 w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Preset chips */}
                  <div className="flex gap-2 mt-3">
                    {PRESETS.map((amt) => {
                      const active = stakeNum === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setStakeAmount(String(amt))}
                          className="flex-1 h-10 rounded-xl text-sm font-bold transition-all duration-150"
                          style={{
                            background: active ? 'rgba(212,173,74,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1.5px solid ${active ? 'rgba(212,173,74,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            color: active ? '#D4AD4A' : 'rgba(255,255,255,0.5)',
                          }}
                        >
                          ${amt}
                        </button>
                      );
                    })}
                  </div>

                  {!isValidStake && stakeAmount !== '' && (
                    <p className="text-xs text-danger mt-1.5">Minimum stake is ${MIN_STAKE} USDC</p>
                  )}
                </div>

                {/* ── Position Breakdown ── */}
                <div className="rounded-xl border border-dark-border overflow-hidden">
                  {/* Visual bar */}
                  <div className="h-1.5 flex">
                    <div style={{ width: `${proposerPct}%`, background: '#D4AD4A' }} />
                    <div style={{ width: `${backerPct}%`, background: '#61A6FB' }} />
                  </div>

                  <div className="p-4 space-y-2.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#D4AD4A' }} />
                        You (Believer {proposerPct}%)
                      </span>
                      <span className="font-mono font-semibold" style={{ color: '#D4AD4A' }}>${isValidStake ? stakeNum.toLocaleString() : '—'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#61A6FB' }} />
                        Backer ({backerPct}%)
                      </span>
                      <span className="font-mono font-semibold" style={{ color: '#61A6FB' }}>${isValidStake ? funderPortion.toLocaleString() : '—'}</span>
                    </div>
                    <div className="h-px bg-dark-border" />
                    <div className="flex justify-between items-center font-semibold text-[15px]">
                      <span className="text-white">Total Position</span>
                      <span className="font-mono text-white">${isValidStake ? totalPosition.toLocaleString() : '—'}</span>
                    </div>
                  </div>
                </div>

                {/* ── Outcomes ── */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#111113] border border-dark-border">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="w-3.5 h-3.5" style={{ color: '#D4AD4A' }} />
                      <span className="text-xs font-semibold" style={{ color: '#D4AD4A' }}>If Profit</span>
                    </div>
                    <p className="text-lg font-bold font-mono text-white leading-tight">
                      {profitComparison ? `${profitComparison.bounceMultiple.toFixed(1)}x` : '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {profitComparison ? `$${profitComparison.bounceReturn.toFixed(2)} return` : 'You earn 60% of gains'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#111113] border border-dark-border">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield className="w-3.5 h-3.5 text-danger" />
                      <span className="text-xs font-semibold text-danger">If Loss</span>
                    </div>
                    <p className="text-lg font-bold font-mono text-white leading-tight">
                      {Math.round(wipeoutPrice * 100)}¢
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Wipeout price</p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-danger/10 border border-danger/20">
                    <p className="text-xs text-danger">{error}</p>
                  </div>
                )}

                {/* ── CTA ── */}
                {!isAuthenticated ? (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={login}
                    className="w-full py-3.5 rounded-xl font-bold text-[15px] transition-all duration-200"
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
                    disabled={isLoading || step === 'success' || !isValidStake}
                    className="w-full py-3.5 rounded-xl font-bold text-[15px] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-200"
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
                        {step === 'ensuring-safe' && 'Setting up Safe...'}
                        {step === 'approving' && 'Approving USDC...'}
                        {step === 'proposing' && 'Proposing Bet...'}
                        {step === 'saving-metadata' && 'Saving...'}
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
