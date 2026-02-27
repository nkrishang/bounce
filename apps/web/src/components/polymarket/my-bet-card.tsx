'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, User, Clock, CheckCircle, BarChart3, XCircle, ArrowDownToLine, Loader2, AlertTriangle, Check, Send } from 'lucide-react';
import type { BetView } from '@bounce/shared';
import { BetStatus, formatAddress } from '@bounce/shared';
import { formatUsdc } from '@/lib/bet-math';
import { useAuth } from '@/hooks/use-auth';
import { useCancelBet } from '@/hooks/use-cancel-bet';
import { useWithdrawBet } from '@/hooks/use-withdraw-bet';
import { useGasPreflight } from '@/hooks/use-gas-preflight';
import { useSignAndSubmitOrder } from '@/hooks/use-sign-and-submit-order';
import { useTradeStatus } from '@/hooks/use-trade-status';
import { useUnprepareTrade } from '@/hooks/use-unprepare-trade';
import { usePolymarketEvent } from '@/hooks/use-polymarket-markets';
import { SellPositionModal } from '@/components/polymarket/sell-position-modal';

interface MyBetCardProps {
  betView: BetView;
  role: 'believer' | 'backer';
}

const statusConfig: Record<number, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  [BetStatus.Proposed]: { label: 'Proposed', color: '#D4AD4A', bg: 'rgba(236, 194, 94, 0.08)', icon: Clock },
  [BetStatus.Funded]: { label: 'Funded', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)', icon: CheckCircle },
  [BetStatus.Prepared]: { label: 'Ready to Trade', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', icon: TrendingUp },
  [BetStatus.Traded]: { label: 'Active', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)', icon: BarChart3 },
  [BetStatus.Closed]: { label: 'Closed', color: '#61A6FB', bg: 'rgba(97, 166, 251, 0.08)', icon: TrendingUp },
  [BetStatus.Cancelled]: { label: 'Cancelled', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.08)', icon: XCircle },
  [BetStatus.Withdrawn]: { label: 'Withdrawn', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.08)', icon: ArrowDownToLine },
};

export function MyBetCard({ betView, role }: MyBetCardProps) {
  const { bet, metadata } = betView;
  const { address } = useAuth();
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const { cancelBet, isLoading: isCancelling, step: cancelStep, error: cancelError, reset: resetCancel } = useCancelBet();
  const { withdrawBet, isLoading: isWithdrawing, step: withdrawStep, error: withdrawError, reset: resetWithdraw } = useWithdrawBet();
  const preflight = useGasPreflight(address as `0x${string}` | undefined);
  const { signAndSubmit, isLoading: isSigning, step: signStep, error: signError, reset: resetSign } = useSignAndSubmitOrder();
  const { unprepare, isLoading: isUnpreparing, step: unprepareStep, error: unprepareError, reset: resetUnprepare } = useUnprepareTrade();

  const { data: tradeStatus, isFetched: tradeStatusFetched } = useTradeStatus(
    (bet.status === BetStatus.Funded || bet.status === BetStatus.Prepared || bet.status === BetStatus.Traded) ? betView.betId : undefined,
  );

  const { data: liveEvent } = usePolymarketEvent(
    bet.status === BetStatus.Traded ? metadata?.slug : undefined,
  );

  const proposerStake = (bet.totalCapital * BigInt(bet.proposerCapitalBps)) / 10000n;
  const funderPortion = bet.totalCapital - proposerStake;
  const isYesOutcome = metadata?.isYesOutcome ?? true;
  const status = statusConfig[bet.status] ?? statusConfig[BetStatus.Proposed];
  const StatusIcon = status.icon;

  // Trade stats for active bets
  const isActive = bet.status === BetStatus.Traded;
  const fillPrice = isActive && bet.positionShares > 0n
    ? Number(bet.usdcSpent) / Number(bet.positionShares)
    : null;
  const proposalPct = metadata?.outcomePrice ? Math.round(parseFloat(metadata.outcomePrice) * 100) : 50;
  const pct = isActive && fillPrice != null ? Math.round(fillPrice * 100) : proposalPct;
  const usdcSpentHuman = isActive ? formatUsdc(bet.usdcSpent) : null;
  const currentPrice = (() => {
    if (!isActive || !liveEvent) return null;
    const metaCid = (metadata?.conditionId ?? '').replace(/^0x/i, '').toLowerCase();
    const market = liveEvent.markets?.find((m) => {
      const mCid = (m.conditionId || m.condition_id || '').replace(/^0x/i, '').toLowerCase();
      return mCid === metaCid;
    });
    if (!market) return null;
    // Try tokens array first (most reliable)
    if (market.tokens?.length) {
      const idx = metadata?.outcomeIndex ?? 0;
      return market.tokens[idx]?.price ?? null;
    }
    // Fallback to outcome_prices string
    try {
      const pricesRaw = (market as any).outcomePrices || market.outcome_prices || '[]';
      const prices: string[] = typeof pricesRaw === 'string' ? JSON.parse(pricesRaw) : pricesRaw;
      const idx = metadata?.outcomeIndex ?? 0;
      return prices[idx] ? parseFloat(prices[idx]) : null;
    } catch { return null; }
  })();

  // PnL calculations for active bets
  const positionValue = isActive && currentPrice != null
    ? Number(bet.positionShares) * currentPrice / 1_000_000
    : null;
  const totalPnl = isActive && positionValue != null
    ? positionValue - Number(bet.usdcSpent) / 1_000_000
    : null;
  const userPnl = (() => {
    if (totalPnl == null) return null;
    const proposerCap = Number(bet.totalCapital) * bet.proposerCapitalBps / 10000 / 1_000_000;
    const funderCap = Number(bet.totalCapital) / 1_000_000 - proposerCap;
    if (totalPnl >= 0) {
      // Profit: split per proposerProfitShareBps
      const proposerProfit = totalPnl * bet.proposerProfitShareBps / 10000;
      const funderProfit = totalPnl - proposerProfit;
      return role === 'believer'
        ? proposerCap + proposerProfit - Number(proposerStake) / 1_000_000
        : funderCap + funderProfit - Number(funderPortion) / 1_000_000;
    } else {
      // Loss: proposer absorbs first
      const loss = -totalPnl;
      if (loss <= proposerCap) {
        return role === 'believer'
          ? (proposerCap - loss) - Number(proposerStake) / 1_000_000
          : 0; // funder fully protected
      } else {
        const funderLoss = loss - proposerCap;
        return role === 'believer'
          ? -Number(proposerStake) / 1_000_000
          : -(funderLoss);
      }
    }
  })();

  const showCancelCta = (bet.status === BetStatus.Proposed && role === 'believer') || bet.status === BetStatus.Funded;
  const showWithdrawCta = bet.status === BetStatus.Closed;
  const isProposer = address?.toLowerCase() === bet.proposer.toLowerCase();
  // Wait for tradeStatus to load before showing trade CTAs to prevent race conditions
  const tradeStatusReady = tradeStatusFetched || (bet.status !== BetStatus.Funded && bet.status !== BetStatus.Prepared);
  const showSignOrderCta = tradeStatusReady && (((bet.status === BetStatus.Funded || bet.status === BetStatus.Prepared) && role === 'believer' && isProposer && !tradeStatus?.orderId) || (signStep === 'confirmed' && (bet.status === BetStatus.Funded || bet.status === BetStatus.Prepared)));
  const showPreparingIndicator = bet.status === BetStatus.Funded && role === 'believer' && tradeStatus?.prepareStatus === 'pending' && !showSignOrderCta;
  const showAwaitingSettlement = bet.status === BetStatus.Prepared && !!tradeStatus?.orderId;
  const hasActiveOrder = !!tradeStatus?.orderId;
  const tradeFailed =
    tradeStatus?.clobStatus === 'FAILED' ||
    tradeStatus?.clobStatus === 'CANCELED' ||
    tradeStatus?.finalizeStatus === 'failed';
  const showUnprepareCta =
    tradeStatusReady &&
    bet.status === BetStatus.Prepared &&
    role === 'believer' &&
    isProposer &&
    (!hasActiveOrder || tradeFailed) &&
    !isSigning;

  const gasBlocked = !preflight.isLoading && !preflight.hasEnoughGas;
  const activeError = cancelError ?? (showWithdrawCta ? withdrawError : showSignOrderCta ? signError : showUnprepareCta ? unprepareError : null);

  const handleCancel = async () => {
    resetCancel();
    try {
      await cancelBet(betView.betId);
    } catch { /* error handled by hook */ }
  };

  const handleWithdraw = async () => {
    resetWithdraw();
    try {
      await withdrawBet(betView.betId);
    } catch { /* error handled by hook */ }
  };

  const handleSignOrder = async () => {
    resetSign();
    try {
      await signAndSubmit(betView);
    } catch { /* error handled by hook */ }
  };

  const handleUnprepare = async () => {
    resetUnprepare();
    try {
      await unprepare(betView.betId);
    } catch { /* error handled by hook */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-dark-border bg-dark-surface p-6 flex flex-col gap-5"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {metadata?.marketImage && (
          <img
            src={metadata.marketImage}
            alt=""
            className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-white/5"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[15px] text-white leading-snug line-clamp-2">
            {metadata?.marketQuestion || 'Polymarket Bet'}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase"
              style={{
                background: isYesOutcome ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: isYesOutcome ? '#22c55e' : '#ef4444',
              }}
            >
              {isYesOutcome ? 'Yes' : 'No'}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{pct}¢</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {isActive ? (
        <div className="flex flex-col gap-0 border border-dark-border rounded-xl overflow-hidden">
          {[
            {
              label: role === 'believer' ? 'Your Investment' : 'Your Funding',
              value: `$${role === 'believer' ? formatUsdc(proposerStake) : formatUsdc(funderPortion)}`,
            },
            {
              label: 'Cost Basis',
              value: `$${usdcSpentHuman}`,
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
              label: 'Position PnL',
              value: totalPnl != null
                ? `${totalPnl >= 0 ? '+' : '-'}$${Math.abs(totalPnl).toFixed(2)}  (${totalPnl >= 0 ? '+' : '-'}${Math.abs(Number(bet.usdcSpent) > 0 ? totalPnl / (Number(bet.usdcSpent) / 1_000_000) * 100 : 0).toFixed(2)}%)`
                : '—',
              color: totalPnl != null ? (totalPnl > 0 ? '#22c55e' : totalPnl < 0 ? '#ef4444' : undefined) : undefined,
            },
            {
              label: `Your PnL`,
              value: userPnl != null
                ? `${userPnl >= 0 ? '+' : '-'}$${Math.abs(userPnl).toFixed(2)}  (${userPnl >= 0 ? '+' : '-'}${Math.abs(Number(role === 'believer' ? proposerStake : funderPortion) > 0 ? userPnl / (Number(role === 'believer' ? proposerStake : funderPortion) / 1_000_000) * 100 : 0).toFixed(2)}%)`
                : '—',
              color: userPnl != null ? (userPnl > 0 ? '#22c55e' : userPnl < 0 ? '#ef4444' : undefined) : undefined,
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
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-dark-border bg-[#111113] px-4 py-3">
            <span className="text-xs text-muted-foreground font-medium">
              {role === 'believer' ? 'Your Stake' : 'Your Funding'}
            </span>
            <p className="text-lg font-bold text-white mt-1 font-mono">
              ${role === 'believer' ? formatUsdc(proposerStake) : formatUsdc(funderPortion)}
            </p>
          </div>
          <div className="rounded-xl border border-dark-border bg-[#111113] px-4 py-3">
            <span className="text-xs text-muted-foreground font-medium">Total Position</span>
            <p className="text-lg font-bold text-white mt-1 font-mono">
              ${formatUsdc(bet.totalCapital)}
            </p>
          </div>
        </div>
      )}

      {/* Trade Structure Bar */}
      {!isActive && <div>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Trade Structure</span>
        <div className="mt-2 h-2 rounded-full overflow-hidden flex">
          <div className="h-full rounded-l-full" style={{ width: '20%', background: 'linear-gradient(90deg, #C8A43A, #D4AD4A)' }} />
          <div className="h-full rounded-r-full" style={{ width: '80%', background: 'linear-gradient(90deg, #4A80C4, #5B93D4)' }} />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] font-medium" style={{ color: '#D4AD4A' }}>20% Believer</span>
          <span className="text-[11px] font-medium" style={{ color: '#5B93D4' }}>80% Backer</span>
        </div>
      </div>}

      {/* Counterparty */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <User className="w-3.5 h-3.5" />
        <span>
          {role === 'believer'
            ? bet.funder !== '0x0000000000000000000000000000000000000000' ? `Backed by ${formatAddress(bet.funder)}` : 'Awaiting Backer'
            : `Proposed by ${formatAddress(bet.proposer)}`
          }
        </span>
      </div>

      {/* Status */}
      {!showSignOrderCta && bet.status !== BetStatus.Proposed && bet.status !== BetStatus.Funded && bet.status !== BetStatus.Traded && bet.status !== BetStatus.Closed && (
        <div
          className="flex items-center justify-center gap-2 py-3 rounded-xl"
          style={{ background: status.bg, border: `1px solid ${status.color}25` }}
        >
          <StatusIcon className="w-4 h-4" style={{ color: status.color }} />
          <span className="text-sm font-medium" style={{ color: status.color }}>{status.label}</span>
        </div>
      )}

      {/* Gas warning */}
      {(showCancelCta || showWithdrawCta) && gasBlocked && (
        <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
          <p className="text-[11px] text-danger">
            Low POL balance for gas fees. Please add POL to your wallet.
          </p>
        </div>
      )}

      {/* Error display */}
      {activeError && (
        <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20">
          <p className="text-xs font-semibold text-danger">{activeError.title}</p>
          <p className="text-[11px] text-danger/80 mt-0.5">{activeError.message}</p>
          <p className="text-[10px] text-danger/50 mt-1 font-mono">Ref: {activeError.errorId}</p>
        </div>
      )}

      {/* Cancel Bet CTA */}
      {showCancelCta && (
        <button
          onClick={handleCancel}
          disabled={isCancelling || cancelStep === 'success' || preflight.isLoading || gasBlocked}
          className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          style={
            cancelStep === 'success'
              ? { background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e' }
              : { background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' }
          }
        >
          {cancelStep === 'success' ? (
            <><Check className="w-4 h-4" /> Cancelled</>
          ) : isCancelling ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Cancelling...</>
          ) : preflight.isLoading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking gas…</>
          ) : (
            <><XCircle className="w-4 h-4" /> Cancel Bet</>
          )}
        </button>
      )}

      {/* Withdraw CTA */}
      {showWithdrawCta && (
        <button
          onClick={handleWithdraw}
          disabled={isWithdrawing || withdrawStep === 'success' || preflight.isLoading || gasBlocked}
          className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          style={
            withdrawStep === 'success'
              ? { background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e' }
              : { background: 'rgba(97, 166, 251, 0.08)', border: '1px solid rgba(97, 166, 251, 0.25)', color: '#61A6FB' }
          }
        >
          {withdrawStep === 'success' ? (
            <><Check className="w-4 h-4" /> Withdrawn</>
          ) : isWithdrawing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Withdrawing...</>
          ) : preflight.isLoading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking gas…</>
          ) : (
            <><ArrowDownToLine className="w-4 h-4" /> Withdraw</>
          )}
        </button>
      )}

      {/* Preparing indicator */}
      {showPreparingIndicator && (
        <div
          className="flex items-center justify-center gap-2 py-3 rounded-xl"
          style={{ background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.15)' }}
        >
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#22c55e' }} />
          <span className="text-sm font-medium" style={{ color: '#22c55e' }}>Preparing trade…</span>
        </div>
      )}

      {/* Sign Order CTA */}
      {showSignOrderCta && (
        <button
          onClick={handleSignOrder}
          disabled={isSigning || signStep === 'confirmed' || signStep === 'polling'}
          className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          style={
            signStep === 'confirmed'
              ? { background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e' }
              : signStep === 'failed'
              ? { background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' }
              : { background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', color: '#f59e0b' }
          }
        >
          {signStep === 'confirmed' ? (
            <><Check className="w-4 h-4" /> Order Confirmed</>
          ) : signStep === 'failed' ? (
            <><Send className="w-4 h-4" /> Retry Place Order</>
          ) : signStep === 'checking' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
          ) : signStep === 'preparing' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Preparing Trade…</>
          ) : signStep === 'signing' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Sign Order…</>
          ) : signStep === 'submitting' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
          ) : signStep === 'polling' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Awaiting Settlement…</>
          ) : (
            <><Send className="w-4 h-4" /> Place Order</>
          )}
        </button>
      )}

      {/* Awaiting Settlement indicator */}
      {showAwaitingSettlement && !showSignOrderCta && (
        <div
          className="flex items-center justify-center gap-2 py-3 rounded-xl"
          style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)' }}
        >
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#f59e0b' }} />
          <span className="text-sm font-medium" style={{ color: '#f59e0b' }}>
            Awaiting settlement{tradeStatus?.clobStatus ? ` (${tradeStatus.clobStatus})` : '…'}
          </span>
        </div>
      )}

      {/* Reset Trade CTA (unprepare stuck Prepared bets) */}
      {showUnprepareCta && (
        <button
          onClick={handleUnprepare}
          disabled={isUnpreparing || unprepareStep === 'success'}
          className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          style={
            unprepareStep === 'success'
              ? { background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e' }
              : { background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' }
          }
        >
          {unprepareStep === 'success' ? (
            <><Check className="w-4 h-4" /> Trade Reset</>
          ) : isUnpreparing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</>
          ) : (
            <><XCircle className="w-4 h-4" /> Reset Trade</>
          )}
        </button>
      )}

      {/* Sell Position CTA — visible on active bets for both roles */}
      {isActive && (
        <button
          onClick={() => setSellModalOpen(true)}
          className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={
            totalPnl != null && totalPnl > 0
              ? { background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)', color: '#22c55e' }
              : totalPnl != null && totalPnl < 0
              ? { background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' }
              : { background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.12)', color: 'rgba(255, 255, 255, 0.6)' }
          }
        >
          {totalPnl != null && totalPnl > 0
            ? <><TrendingUp className="w-4 h-4" /> Sell Position</>
            : <><TrendingDown className="w-4 h-4" /> Sell Position</>
          }
        </button>
      )}

      {/* Sell Position Modal */}
      {isActive && sellModalOpen && (
        <SellPositionModal
          betView={betView}
          role={role}
          open={sellModalOpen}
          onClose={() => setSellModalOpen(false)}
        />
      )}
    </motion.div>
  );
}
