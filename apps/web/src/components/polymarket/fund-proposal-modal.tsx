'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, TrendingUp, Loader2, Check, AlertTriangle } from 'lucide-react';
import type { BetView } from '@bounce/shared';
import { formatAddress } from '@bounce/shared';
import { useAuth } from '@/hooks/use-auth';
import { useFundBet } from '@/hooks/use-fund-bet';
import { useFundPreflight } from '@/hooks/use-fund-preflight';
import { formatUnits } from 'viem';
import { formatUsdc, DEFAULT_PROPOSER_PROFIT_SHARE_BPS } from '@/lib/bet-math';

interface FundProposalModalProps {
  betView: BetView;
  open: boolean;
  onClose: () => void;
}

export function FundProposalModal({ betView, open, onClose }: FundProposalModalProps) {
  const router = useRouter();
  const { isAuthenticated, login, address } = useAuth();
  const { fundBet, isLoading, step, error, reset } = useFundBet();

  const { bet, metadata } = betView;
  const proposerStake = (bet.totalCapital * BigInt(bet.proposerCapitalBps)) / 10000n;
  const funderPortion = bet.totalCapital - proposerStake;
  const pct = metadata?.outcomePrice ? Math.round(parseFloat(metadata.outcomePrice) * 100) : 50;
  const isYesOutcome = metadata?.isYesOutcome ?? true;
  const proposerPct = bet.proposerCapitalBps / 100;
  const backerPct = 100 - proposerPct;
  const funderProfitSharePct = (10000 - DEFAULT_PROPOSER_PROFIT_SHARE_BPS) / 100;
  const price = metadata?.outcomePrice ? parseFloat(metadata.outcomePrice) : 0;
  const totalCapitalNum = parseFloat(formatUnits(bet.totalCapital, 6));
  const funderPortionNum = parseFloat(formatUnits(funderPortion, 6));

  // Win: funder's 40% share of total profit
  const totalProfit = price > 0 ? totalCapitalNum * (1 / price - 1) : 0;
  const funderProfit = totalProfit * ((10000 - DEFAULT_PROPOSER_PROFIT_SHARE_BPS) / 10000);
  const regularProfit = price > 0 ? funderPortionNum * (1 / price - 1) : 0;

  // Loss: at proposer wipeout, funder loses $0 — regular bet loses proposerPct%
  const wipeoutPrice = price * (1 - bet.proposerCapitalBps / 10000);
  const regularLossAtWipeout = funderPortionNum * (bet.proposerCapitalBps / 10000);

  const preflight = useFundPreflight(address as `0x${string}` | undefined, funderPortion);

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

  // Redirect to /my-bets after success
  useEffect(() => {
    if (step !== 'success') return;
    const timer = setTimeout(() => {
      onClose();
      router.push('/my-bets');
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, onClose, router]);

  // Transaction stepper steps
  const txSteps = useMemo(() => [
    { key: 'approving', label: 'Approve' },
    { key: 'funding', label: 'Fund' },
  ], []);

  const activeStepKey = isLoading ? step : step === 'success' ? '__done__' : null;
  const activeIdx = useMemo(() => {
    if (!activeStepKey) return -1;
    if (activeStepKey === '__done__') return txSteps.length;
    return txSteps.findIndex(s => s.key === activeStepKey);
  }, [activeStepKey, txSteps]);

  const handleFund = async () => {
    try {
      await fundBet(betView.betId);
    } catch (err) {
      console.error(err);
    }
  };

  // Preflight-aware button disable
  const preflightReady = !preflight.isLoading;
  const balanceBlocked = preflightReady && isAuthenticated && (
    !preflight.hasEnoughUsdc || !preflight.hasEnoughGas
  );

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
                {metadata?.marketImage && (
                  <img src={metadata.marketImage} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-white leading-snug line-clamp-2 pr-8">
                    {metadata?.marketQuestion || 'Fund Bet'}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold"
                      style={{
                        background: isYesOutcome ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: isYesOutcome ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {isYesOutcome ? 'Yes' : 'No'}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{pct}¢</span>
                    <span className="text-[11px] text-muted-foreground">by {formatAddress(bet.proposer)}</span>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-3">
                {/* ── Funding Breakdown ── */}
                <div className="rounded-xl border border-dark-border bg-[#111113] p-4">
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Believer Stake ({proposerPct}%)</span>
                      <span className="font-mono font-medium" style={{ color: '#D4AD4A' }}>${formatUsdc(proposerStake)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your Funding ({backerPct}%)</span>
                      <span className="font-mono font-semibold" style={{ color: '#61A6FB' }}>${formatUsdc(funderPortion)}</span>
                    </div>
                    <div className="h-px bg-dark-border" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-white">Total Position</span>
                      <span className="text-base font-mono font-bold text-white">${formatUsdc(bet.totalCapital)}</span>
                    </div>
                  </div>

                  {/* Position bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: '#D4AD4A' }} />
                          <span className="text-muted-foreground">Believer {proposerPct}%</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: '#61A6FB' }} />
                          <span className="text-muted-foreground">You {backerPct}%</span>
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden flex">
                      <div
                        className="h-full rounded-l-full"
                        style={{ width: `${proposerPct}%`, background: '#D4AD4A' }}
                      />
                      <div
                        className="h-full rounded-r-full"
                        style={{ width: `${backerPct}%`, background: '#61A6FB' }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── If Win / If Loss cards ── */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* If Win */}
                  <div className="rounded-xl border border-[#4ade80]/20 bg-[#0f1a14] p-3.5">
                    <div className="flex items-center gap-1.5 mb-3">
                      <TrendingUp className="w-4 h-4" style={{ color: '#4ade80' }} />
                      <span className="text-sm font-semibold" style={{ color: '#4ade80' }}>If Win</span>
                    </div>
                    {price > 0 ? (
                      <div className="space-y-2.5">
                        <div>
                          <span className="text-[12px] text-muted-foreground block mb-0.5">Regular</span>
                          <span className="text-base font-mono text-muted-foreground">
                            +${regularProfit.toFixed(2)}
                          </span>
                          <div className="h-1 rounded-full bg-white/5 overflow-hidden mt-1">
                            <div className="h-full rounded-full bg-white/20" style={{ width: '33.3%' }} />
                          </div>
                        </div>
                        <div>
                          <span className="text-[12px] text-white font-medium block mb-0.5">Bounce</span>
                          <span className="text-base font-mono font-bold" style={{ color: '#4ade80' }}>
                            +${funderProfit.toFixed(2)}
                          </span>
                          <div className="h-1 rounded-full bg-white/5 overflow-hidden mt-1">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: 'linear-gradient(90deg, #4ade80, #86efac)' }}
                              initial={{ width: '33.3%' }}
                              animate={{ width: '100%' }}
                              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
                            />
                          </div>
                        </div>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{ background: 'rgba(74, 222, 128, 0.12)', color: '#4ade80' }}
                        >
                          {funderProfitSharePct}% of gains
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Price unavailable</p>
                    )}
                  </div>

                  {/* If Loss */}
                  <div className="rounded-xl border border-[#61A6FB]/20 bg-[#0f1320] p-3.5">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Shield className="w-4 h-4" style={{ color: '#61A6FB' }} />
                      <span className="text-sm font-semibold" style={{ color: '#61A6FB' }}>If Loss</span>
                    </div>
                    <div className="space-y-2.5">
                      <div>
                        <span className="text-[12px] text-muted-foreground block mb-0.5">Regular</span>
                        <span className="text-base font-mono" style={{ color: '#E03537' }}>
                          −${regularLossAtWipeout.toFixed(2)}
                        </span>
                        <div className="h-1 rounded-full bg-white/5 overflow-hidden mt-1">
                          <div className="h-full rounded-full" style={{ width: '100%', background: 'rgba(224, 53, 55, 0.4)' }} />
                        </div>
                      </div>
                      <div>
                        <span className="text-[12px] text-white font-medium block mb-0.5">Bounce</span>
                        <span className="text-base font-mono font-bold" style={{ color: '#61A6FB' }}>
                          $0.00 loss
                        </span>
                        <div className="h-1 rounded-full bg-white/5 overflow-hidden mt-1">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: 'linear-gradient(90deg, #61A6FB, #93c5fd)' }}
                            initial={{ width: '100%' }}
                            animate={{ width: '0%' }}
                            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
                          />
                        </div>
                      </div>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
                        style={{ background: 'rgba(97, 166, 251, 0.12)', color: '#61A6FB' }}
                      >
                        Protected to {Math.round(wipeoutPrice * 100)}¢
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pre-flight warnings */}
                {isAuthenticated && !preflight.isLoading && step !== 'success' && (
                  <>
                    {!preflight.hasEnoughUsdc && (
                      <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                        <p className="text-xs text-danger">
                          Insufficient USDC balance. You need ${formatUsdc(funderPortion)} but have ${preflight.usdcBalance.toFixed(2)}.
                        </p>
                      </div>
                    )}
                    {!preflight.hasEnoughGas && (
                      <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                        <p className="text-xs text-danger">
                          Low POL balance for gas fees. Please add POL to your wallet.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Transaction stepper — only during active tx or success */}
                {isAuthenticated && (isLoading || step === 'success') && (
                  <div className="px-2 py-3">
                    <div className="flex items-center">
                      {txSteps.map((s, i) => {
                        const sIdx = txSteps.findIndex(ts => ts.key === s.key);
                        const isCompleted = activeIdx > sIdx;
                        const isActive = activeIdx === sIdx;
                        return (
                          <div key={s.key} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center gap-1.5">
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300"
                                style={{
                                  background: isCompleted
                                    ? '#D4AD4A'
                                    : isActive
                                      ? 'rgba(212,173,74,0.15)'
                                      : 'rgba(255,255,255,0.05)',
                                  border: isActive
                                    ? '2px solid #D4AD4A'
                                    : isCompleted
                                      ? '2px solid #D4AD4A'
                                      : '2px solid rgba(255,255,255,0.1)',
                                }}
                              >
                                {isCompleted ? (
                                  <Check className="w-3.5 h-3.5 text-black" />
                                ) : isActive ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#D4AD4A' }} />
                                ) : (
                                  <span className="text-[10px] font-bold text-white/30">{i + 1}</span>
                                )}
                              </div>
                              <span
                                className="text-[10px] font-medium whitespace-nowrap transition-colors duration-300"
                                style={{
                                  color: isCompleted || isActive ? '#D4AD4A' : 'rgba(255,255,255,0.3)',
                                }}
                              >
                                {s.label}
                              </span>
                            </div>
                            {i < txSteps.length - 1 && (
                              <div className="flex-1 h-0.5 mx-2 mb-5 rounded-full overflow-hidden bg-white/5">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: isCompleted ? '100%' : '0%',
                                    background: '#D4AD4A',
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Structured error display */}
                {error && (
                  <div className="p-3 rounded-xl bg-danger/10 border border-danger/20">
                    <p className="text-sm font-semibold text-danger">{error.title}</p>
                    <p className="text-xs text-danger/80 mt-1">{error.message}</p>
                    <p className="text-[10px] text-danger/50 mt-2 font-mono">Ref: {error.errorId}</p>
                  </div>
                )}

                {/* ── CTA ── */}
                {!isAuthenticated ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={login}
                    className="w-full py-4 rounded-xl font-bold text-base shadow-lg transition-all duration-200"
                    style={{
                      background: 'linear-gradient(135deg, #3B82F6, #61A6FB)',
                      color: 'white',
                      boxShadow: '0 0 20px rgba(97, 166, 251, 0.3)',
                    }}
                  >
                    Sign In to Fund
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={!isLoading && step !== 'success' ? { scale: 1.02 } : {}}
                    whileTap={!isLoading && step !== 'success' ? { scale: 0.98 } : {}}
                    onClick={handleFund}
                    disabled={isLoading || step === 'success' || preflight.isLoading || balanceBlocked}
                    className="w-full py-4 rounded-xl font-bold text-base disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg transition-all duration-200"
                    style={
                      step === 'success'
                        ? { background: '#22c55e', color: 'white', boxShadow: '0 0 20px rgba(34, 197, 94, 0.3)' }
                        : {
                            background: 'linear-gradient(135deg, #3B82F6, #61A6FB)',
                            color: 'white',
                            boxShadow: '0 0 20px rgba(97, 166, 251, 0.3)',
                          }
                    }
                  >
                    {step === 'success' ? (
                      <><Check className="w-5 h-5" /> Bet Funded!</>
                    ) : isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {step === 'approving' && 'Approving USDC...'}
                        {step === 'funding' && 'Funding Bet...'}
                      </>
                    ) : preflight.isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking balances…
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5" />
                        Fund ${formatUsdc(funderPortion)} USDC
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
