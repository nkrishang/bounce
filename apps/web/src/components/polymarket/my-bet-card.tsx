'use client';

import { motion } from 'framer-motion';
import { Shield, TrendingUp, User, Clock, CheckCircle, BarChart3, XCircle, ArrowDownToLine, Loader2, AlertTriangle, Check } from 'lucide-react';
import type { BetView } from '@bounce/shared';
import { BetStatus, formatAddress } from '@bounce/shared';
import { formatUsdc } from '@/lib/bet-math';
import { useAuth } from '@/hooks/use-auth';
import { useCancelBet } from '@/hooks/use-cancel-bet';
import { useWithdrawBet } from '@/hooks/use-withdraw-bet';
import { useGasPreflight } from '@/hooks/use-gas-preflight';

interface MyBetCardProps {
  betView: BetView;
  role: 'believer' | 'backer';
}

const statusConfig: Record<number, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  [BetStatus.Proposed]: { label: 'Proposed', color: '#D4AD4A', bg: 'rgba(236, 194, 94, 0.08)', icon: Clock },
  [BetStatus.Funded]: { label: 'Funded', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)', icon: CheckCircle },
  [BetStatus.Traded]: { label: 'Active', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)', icon: BarChart3 },
  [BetStatus.Closed]: { label: 'Closed', color: '#61A6FB', bg: 'rgba(97, 166, 251, 0.08)', icon: TrendingUp },
  [BetStatus.Cancelled]: { label: 'Cancelled', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.08)', icon: XCircle },
  [BetStatus.Withdrawn]: { label: 'Withdrawn', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.08)', icon: ArrowDownToLine },
};

export function MyBetCard({ betView, role }: MyBetCardProps) {
  const { bet, metadata } = betView;
  const { address } = useAuth();
  const { cancelBet, isLoading: isCancelling, step: cancelStep, error: cancelError, reset: resetCancel } = useCancelBet();
  const { withdrawBet, isLoading: isWithdrawing, step: withdrawStep, error: withdrawError, reset: resetWithdraw } = useWithdrawBet();
  const preflight = useGasPreflight(address as `0x${string}` | undefined);

  const proposerStake = (bet.totalCapital * BigInt(bet.proposerCapitalBps)) / 10000n;
  const funderPortion = bet.totalCapital - proposerStake;
  const pct = metadata?.outcomePrice ? Math.round(parseFloat(metadata.outcomePrice) * 100) : 50;
  const isYesOutcome = metadata?.isYesOutcome ?? true;
  const status = statusConfig[bet.status] ?? statusConfig[BetStatus.Proposed];
  const StatusIcon = status.icon;

  const showCancelCta = bet.status === BetStatus.Proposed && role === 'believer';
  const showWithdrawCta = bet.status === BetStatus.Closed;

  const gasBlocked = !preflight.isLoading && !preflight.hasEnoughGas;
  const activeError = showCancelCta ? cancelError : showWithdrawCta ? withdrawError : null;

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

      {/* Trade Structure Bar */}
      <div>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Trade Structure</span>
        <div className="mt-2 h-2 rounded-full overflow-hidden flex">
          <div className="h-full rounded-l-full" style={{ width: '20%', background: 'linear-gradient(90deg, #C8A43A, #D4AD4A)' }} />
          <div className="h-full rounded-r-full" style={{ width: '80%', background: 'linear-gradient(90deg, #4A80C4, #5B93D4)' }} />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] font-medium" style={{ color: '#D4AD4A' }}>20% Believer</span>
          <span className="text-[11px] font-medium" style={{ color: '#5B93D4' }}>80% Backer</span>
        </div>
      </div>

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
      <div
        className="flex items-center justify-center gap-2 py-3 rounded-xl"
        style={{ background: status.bg, border: `1px solid ${status.color}25` }}
      >
        <StatusIcon className="w-4 h-4" style={{ color: status.color }} />
        <span className="text-sm font-medium" style={{ color: status.color }}>{status.label}</span>
      </div>

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
    </motion.div>
  );
}
