'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingDown, TrendingUp, Loader2, Check, AlertTriangle } from 'lucide-react';
import type { BetView } from '@bounce/shared';
import { formatAddress } from '@bounce/shared';
import { useAuth } from '@/hooks/use-auth';
import { useClosePosition } from '@/hooks/use-close-position';
import { useGasPreflight } from '@/hooks/use-gas-preflight';
import { usePolymarketEvent } from '@/hooks/use-polymarket-markets';
import { useTradeStatus } from '@/hooks/use-trade-status';
import { formatUsdc, computeWithdrawAmounts } from '@/lib/bet-math';

interface SellPositionModalProps {
  betView: BetView;
  role: 'believer' | 'backer';
  open: boolean;
  onClose: () => void;
}

export function SellPositionModal({ betView, role, open, onClose }: SellPositionModalProps) {
  const router = useRouter();
  const { address } = useAuth();
  const { closePosition, resumeClose, isLoading, step, error, reset } = useClosePosition();
  const preflight = useGasPreflight(address as `0x${string}` | undefined);
  const { data: tradeStatus } = useTradeStatus(open ? betView.betId : undefined);
  const resumeStartedRef = useRef(false);

  const { bet, metadata } = betView;
  const proposerStake = (bet.totalCapital * BigInt(bet.proposerCapitalBps)) / 10000n;
  const funderPortion = bet.totalCapital - proposerStake;
  const isYesOutcome = metadata?.isYesOutcome ?? true;
  const isProposer = address?.toLowerCase() === bet.proposer.toLowerCase();

  const { data: liveEvent } = usePolymarketEvent(
    open ? metadata?.slug : undefined,
  );

  // Compute current price from live event
  const currentPrice = useMemo(() => {
    if (!liveEvent) return null;
    const metaCid = (metadata?.conditionId ?? '').replace(/^0x/i, '').toLowerCase();
    const market = liveEvent.markets?.find((m) => {
      const mCid = (m.conditionId || m.condition_id || '').replace(/^0x/i, '').toLowerCase();
      return mCid === metaCid;
    });
    if (!market) return null;
    if (market.tokens?.length) {
      const idx = metadata?.outcomeIndex ?? 0;
      return market.tokens[idx]?.price ?? null;
    }
    try {
      const pricesRaw = (market as any).outcomePrices || market.outcome_prices || '[]';
      const prices: string[] = typeof pricesRaw === 'string' ? JSON.parse(pricesRaw) : pricesRaw;
      const idx = metadata?.outcomeIndex ?? 0;
      return prices[idx] ? parseFloat(prices[idx]) : null;
    } catch { return null; }
  }, [liveEvent, metadata]);

  // Trade stats
  const fillPrice = bet.positionShares > 0n
    ? Number(bet.usdcSpent) / Number(bet.positionShares)
    : null;
  const usdcSpentHuman = Number(bet.usdcSpent) / 1_000_000;
  const sharesHuman = Number(bet.positionShares) / 1_000_000;

  // Estimated proceeds from selling all shares
  const estimatedProceeds = currentPrice != null
    ? sharesHuman * currentPrice
    : null;

  // Position PnL
  const totalPnl = estimatedProceeds != null
    ? estimatedProceeds - usdcSpentHuman
    : null;

  // Estimated distribution after sell (using computeWithdrawAmounts)
  const distribution = useMemo(() => {
    if (estimatedProceeds == null) return null;
    // Total returned = escrow (leftover from buy) + sell proceeds
    const totalReturned = bet.escrowUSDC + BigInt(Math.round(estimatedProceeds * 1_000_000));
    return computeWithdrawAmounts(
      totalReturned,
      bet.totalCapital,
      bet.proposerCapitalBps,
      bet.proposerProfitShareBps,
    );
  }, [estimatedProceeds, bet]);

  const userPnl = useMemo(() => {
    if (!distribution) return null;
    if (role === 'believer') {
      return Number(distribution.proposerAmount) / 1_000_000 - Number(proposerStake) / 1_000_000;
    }
    return Number(distribution.funderAmount) / 1_000_000 - Number(funderPortion) / 1_000_000;
  }, [distribution, role, proposerStake, funderPortion]);

  // Detect if a close flow is already in progress (CLOB sell placed but not finalized)
  const closeInProgress = !!(
    tradeStatus?.flow === 'close' &&
    tradeStatus?.orderId &&
    tradeStatus?.finalizeStatus !== 'confirmed' &&
    tradeStatus?.clobStatus !== 'FAILED' &&
    tradeStatus?.clobStatus !== 'CANCELED'
  );

  useEffect(() => {
    if (!open) {
      reset();
      resumeStartedRef.current = false;
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

  // Auto-resume settlement if a close flow is in progress
  useEffect(() => {
    if (!open || !isProposer || !closeInProgress || resumeStartedRef.current || isLoading || step !== 'idle') return;
    resumeStartedRef.current = true;
    resumeClose(betView.betId).then(() => {
      setTimeout(() => {
        onClose();
        router.push('/my-bets?tab=settled');
      }, 2000);
    }).catch((err) => {
      console.error(err);
    });
  }, [open, isProposer, closeInProgress, isLoading, step, resumeClose, betView.betId, onClose, router]);

  // Transaction stepper steps
  const txSteps = useMemo(() => [
    { key: 'signing', label: 'Sign' },
    { key: 'submitting', label: 'Submit' },
    { key: 'polling', label: 'Settle' },
  ], []);

  const activeStepKey = isLoading ? step : step === 'confirmed' ? '__done__' : null;
  const activeIdx = useMemo(() => {
    if (!activeStepKey) return -1;
    if (activeStepKey === '__done__') return txSteps.length;
    if (activeStepKey === 'checking') return 0;
    return txSteps.findIndex(s => s.key === activeStepKey);
  }, [activeStepKey, txSteps]);

  const handleSell = async () => {
    try {
      await closePosition(betView);
      setTimeout(() => {
        onClose();
        router.push('/my-bets?tab=settled');
      }, 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const gasBlocked = !preflight.isLoading && !preflight.hasEnoughGas;

  // PnL-based theming
  const accentColor = totalPnl != null && totalPnl > 0 ? '#22c55e' : totalPnl != null && totalPnl < 0 ? '#ef4444' : 'rgba(255, 255, 255, 0.6)';
  const accentBg = totalPnl != null && totalPnl > 0 ? 'rgba(34, 197, 94, 0.08)' : totalPnl != null && totalPnl < 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.04)';
  const accentBorder = totalPnl != null && totalPnl > 0 ? 'rgba(34, 197, 94, 0.25)' : totalPnl != null && totalPnl < 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.12)';
  const accentShadow = totalPnl != null && totalPnl > 0 ? 'rgba(34, 197, 94, 0.1)' : totalPnl != null && totalPnl < 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)';
  const TrendIcon = totalPnl != null && totalPnl > 0 ? TrendingUp : TrendingDown;

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

              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-center gap-3">
                {metadata?.marketImage && (
                  <img src={metadata.marketImage} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-white leading-snug line-clamp-2 pr-8">
                    {metadata?.marketQuestion || 'Sell Position'}
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
                    {currentPrice != null && (
                      <span className="text-xs text-muted-foreground font-mono">{(currentPrice * 100).toFixed(1)}¢</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {role === 'believer' ? `Backed by ${formatAddress(bet.funder)}` : `by ${formatAddress(bet.proposer)}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-3">
                {/* Position Details */}
                <div className="rounded-xl border border-dark-border bg-[#111113] overflow-hidden">
                  {[
                    {
                      label: role === 'believer' ? 'Your Investment' : 'Your Funding',
                      value: `$${role === 'believer' ? formatUsdc(proposerStake) : formatUsdc(funderPortion)}`,
                    },
                    {
                      label: 'Cost Basis',
                      value: `$${usdcSpentHuman.toFixed(2)}`,
                    },
                    {
                      label: 'Fill Price',
                      value: fillPrice != null ? `${(fillPrice * 100).toFixed(2)}¢` : '—',
                    },
                    {
                      label: 'Current Price',
                      value: currentPrice != null ? `${(currentPrice * 100).toFixed(2)}¢` : '—',
                      color: currentPrice != null && fillPrice != null
                        ? currentPrice > fillPrice ? '#22c55e' : currentPrice < fillPrice ? '#ef4444' : undefined
                        : undefined,
                    },
                    {
                      label: 'Shares',
                      value: sharesHuman.toFixed(2),
                    },
                  ].map((row, i) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-dark-border' : ''}`}
                    >
                      <span className="text-sm text-muted-foreground">{row.label}</span>
                      <span
                        className="text-sm font-semibold font-mono"
                        style={{ color: row.color ?? 'white' }}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Estimated Proceeds */}
                <div className="rounded-xl border border-dark-border bg-[#111113] p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Est. Proceeds</span>
                    <span className="text-lg font-bold font-mono text-white">
                      {estimatedProceeds != null ? `$${estimatedProceeds.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  {totalPnl != null && (
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-muted-foreground">Position PnL</span>
                      <span
                        className="text-sm font-semibold font-mono"
                        style={{ color: totalPnl > 0 ? '#22c55e' : totalPnl < 0 ? '#ef4444' : 'white' }}
                      >
                        {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(2)}
                        {usdcSpentHuman > 0 && (
                          <span className="text-xs ml-1">
                            ({totalPnl >= 0 ? '+' : '-'}{Math.abs(totalPnl / usdcSpentHuman * 100).toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {distribution && userPnl != null && (
                    <>
                      <div className="h-px bg-dark-border my-2" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Your Payout</span>
                        <span className="text-sm font-semibold font-mono text-white">
                          ${(Number(role === 'believer' ? distribution.proposerAmount : distribution.funderAmount) / 1_000_000).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-sm text-muted-foreground">Your PnL</span>
                        <span
                          className="text-sm font-semibold font-mono"
                          style={{ color: userPnl > 0 ? '#22c55e' : userPnl < 0 ? '#ef4444' : 'white' }}
                        >
                          {userPnl >= 0 ? '+' : '-'}${Math.abs(userPnl).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Note about sell-all */}
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-2">
                  <TrendIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <p className="text-[11px] text-muted-foreground">
                    This will sell all {sharesHuman.toFixed(2)} shares at the best available market price. The position will be closed and proceeds distributed.
                  </p>
                </div>

                {/* Gas warning */}
                {isProposer && gasBlocked && step !== 'confirmed' && (
                  <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
                    <p className="text-[11px] text-danger">
                      Low POL balance for gas fees. Please add POL to your wallet.
                    </p>
                  </div>
                )}

                {/* Funder info */}
                {!isProposer && step !== 'confirmed' && (
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-xs text-muted-foreground">
                      Only the believer ({formatAddress(bet.proposer)}) can sell this position. The sell order requires their wallet signature.
                    </p>
                  </div>
                )}

                {/* Transaction stepper */}
                {isProposer && (isLoading || step === 'confirmed') && (
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
                                    ? accentColor
                                    : isActive
                                      ? `${accentColor}26`
                                      : 'rgba(255,255,255,0.05)',
                                  border: isActive || isCompleted
                                    ? `2px solid ${accentColor}`
                                    : '2px solid rgba(255,255,255,0.1)',
                                }}
                              >
                                {isCompleted ? (
                                  <Check className="w-3.5 h-3.5 text-white" />
                                ) : isActive ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: accentColor }} />
                                ) : (
                                  <span className="text-[10px] font-bold text-white/30">{i + 1}</span>
                                )}
                              </div>
                              <span
                                className="text-[10px] font-medium whitespace-nowrap transition-colors duration-300"
                                style={{
                                  color: isCompleted || isActive ? accentColor : 'rgba(255,255,255,0.3)',
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
                                    background: accentColor,
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

                {/* Error display */}
                {error && (
                  <div className="p-3 rounded-xl bg-danger/10 border border-danger/20">
                    <p className="text-sm font-semibold text-danger">{error.title}</p>
                    <p className="text-xs text-danger/80 mt-1">{error.message}</p>
                    <p className="text-[10px] text-danger/50 mt-2 font-mono">Ref: {error.errorId}</p>
                  </div>
                )}

                {/* CTA */}
                {isProposer ? (
                  <motion.button
                    whileHover={!isLoading && step !== 'confirmed' ? { scale: 1.02 } : {}}
                    whileTap={!isLoading && step !== 'confirmed' ? { scale: 0.98 } : {}}
                    onClick={handleSell}
                    disabled={isLoading || step === 'confirmed' || preflight.isLoading || gasBlocked}
                    className="w-full py-4 rounded-xl font-bold text-base disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg transition-all duration-200"
                    style={
                      step === 'confirmed'
                        ? { background: '#22c55e', color: 'white', boxShadow: '0 0 20px rgba(34, 197, 94, 0.3)' }
                        : {
                            background: accentBg,
                            border: `1px solid ${accentBorder}`,
                            color: accentColor,
                            boxShadow: `0 0 20px ${accentShadow}`,
                          }
                    }
                  >
                    {step === 'confirmed' ? (
                      <><Check className="w-5 h-5" /> Position Sold!</>
                    ) : isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {step === 'checking' && 'Checking…'}
                        {step === 'signing' && 'Signing…'}
                        {step === 'submitting' && 'Submitting…'}
                        {step === 'polling' && 'Awaiting Settlement…'}
                      </>
                    ) : step === 'failed' ? (
                      <>
                        <TrendIcon className="w-5 h-5" />
                        Retry Sell Position
                      </>
                    ) : preflight.isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking gas…
                      </>
                    ) : (
                      <>
                        <TrendIcon className="w-5 h-5" />
                        Sell Position
                      </>
                    )}
                  </motion.button>
                ) : (
                  <div
                    className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
                    style={{
                      background: accentBg,
                      border: `1px solid ${accentBorder}`,
                      color: accentColor,
                    }}
                  >
                    <TrendIcon className="w-5 h-5" />
                    Only Believer Can Sell
                  </div>
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
