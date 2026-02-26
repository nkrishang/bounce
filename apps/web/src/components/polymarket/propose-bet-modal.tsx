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
                <div className="rounded-xl border border-dark-border bg-[#111113] p-4">
                  {/* Amount input row */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustStake(-5)}
                      disabled={stakeNum <= MIN_STAKE}
                      className="shrink-0 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xl font-medium pointer-events-none">$</span>
                      <input
                        type="number"
                        min={MIN_STAKE}
                        step="1"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        className="w-full bg-transparent h-12 pl-8 pr-16 text-2xl font-mono font-bold text-white text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none uppercase tracking-wide">USDC</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => adjustStake(5)}
                      className="shrink-0 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Preset chips */}
                  <div className="flex gap-1.5 mt-3">
                    {PRESETS.map((amt) => {
                      const active = stakeNum === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setStakeAmount(String(amt))}
                          className="flex-1 h-8 rounded-full text-xs font-bold transition-all duration-150"
                          style={{
                            background: active ? 'rgba(212,173,74,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${active ? 'rgba(212,173,74,0.4)' : 'transparent'}`,
                            color: active ? '#D4AD4A' : 'rgba(255,255,255,0.4)',
                          }}
                        >
                          ${amt}
                        </button>
                      );
                    })}
                  </div>

                  {!isValidStake && stakeAmount !== '' && (
                    <p className="text-xs text-danger mt-2">Minimum stake is ${MIN_STAKE} USDC</p>
                  )}
                </div>

                {/* ── Position & Outcomes ── */}
                <div className="rounded-xl border border-dark-border bg-[#111113] overflow-hidden">
                  {/* Position Breakdown */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-semibold text-white">Position</span>
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: 'rgba(97, 166, 251, 0.12)', color: '#61A6FB' }}
                      >
                        ${isValidStake ? totalPosition.toLocaleString() : '—'} total
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-xs text-muted-foreground">
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: '#D4AD4A' }} />
                          You {proposerPct}%
                          <span className="mx-1.5 text-white/20">·</span>
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: '#61A6FB' }} />
                          Backer {backerPct}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
                        <div className="h-full" style={{ width: `${proposerPct}%`, background: '#D4AD4A', borderRadius: '9999px 0 0 9999px' }} />
                        <div className="h-full" style={{ width: `${backerPct}%`, background: '#61A6FB', borderRadius: '0 9999px 9999px 0' }} />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-sm font-mono font-semibold" style={{ color: '#D4AD4A' }}>
                          ${isValidStake ? stakeNum.toLocaleString() : '—'}
                        </span>
                        <span className="text-sm font-mono font-semibold" style={{ color: '#61A6FB' }}>
                          ${isValidStake ? funderPortion.toLocaleString() : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-dark-border" />
                  {/* If You Win */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" style={{ color: '#D4AD4A' }} />
                        <span className="text-xs font-semibold" style={{ color: '#D4AD4A' }}>If You Win</span>
                      </div>
                      {profitComparison && (
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
                          style={{ background: 'rgba(212,173,74,0.15)', color: '#D4AD4A' }}
                        >
                          3× more profit
                        </span>
                      )}
                    </div>

                    {profitComparison ? (
                      <div className="space-y-3">
                        {/* Regular bet */}
                        <div>
                          <div className="flex justify-between items-baseline mb-1.5">
                            <span className="text-xs text-muted-foreground">Regular bet</span>
                            <span className="text-sm font-mono text-muted-foreground">
                              +${profitComparison.regularProfit.toFixed(2)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full bg-white/20" style={{ width: '33.3%' }} />
                          </div>
                        </div>

                        {/* Bounce bet */}
                        <div>
                          <div className="flex justify-between items-baseline mb-1.5">
                            <span className="text-xs text-white font-medium">With Bounce</span>
                            <span className="text-sm font-mono font-bold" style={{ color: '#D4AD4A' }}>
                              +${profitComparison.bounceProfit.toFixed(2)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: 'linear-gradient(90deg, #D4AD4A, #ECC25E)' }}
                              initial={{ width: '33.3%' }}
                              animate={{ width: '100%' }}
                              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Enter a valid stake to see comparison</p>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-dark-border" />

                  {/* If Loss */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-danger" />
                        <span className="text-xs font-semibold text-danger">If Loss</span>
                      </div>
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                      >
                        −20% wipeout
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-xs text-muted-foreground">Your ${isValidStake ? stakeNum.toLocaleString() : '—'} capital bears the first 20% loss</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/15 overflow-hidden relative">
                        <div
                          className="absolute top-0 h-full"
                          style={{
                            left: `${(1 - DEFAULT_PROPOSER_CAPITAL_BPS / 10000) * 100}%`,
                            right: 0,
                            background: 'rgba(239, 68, 68, 0.5)',
                            borderRadius: '0 9999px 9999px 0',
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5 relative">
                        <span className="text-[11px] text-muted-foreground font-mono">0¢</span>
                        <span
                          className="text-[11px] font-mono absolute"
                          style={{
                            left: `${(1 - DEFAULT_PROPOSER_CAPITAL_BPS / 10000) * 100}%`,
                            transform: 'translateX(-50%)',
                            color: '#ef4444',
                          }}
                        >
                          {Math.round(wipeoutPrice * 100)}¢
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">{pct}¢</span>
                      </div>
                    </div>
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
