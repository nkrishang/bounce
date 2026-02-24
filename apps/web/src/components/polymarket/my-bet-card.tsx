'use client';

import { motion } from 'framer-motion';
import { Shield, TrendingUp, User, Clock, CheckCircle, BarChart3, XCircle, ArrowDownToLine, Loader2 } from 'lucide-react';
import type { BetView } from '@bounce/shared';
import { BetStatus, formatAddress } from '@bounce/shared';
import { formatUsdc } from '@/lib/bet-math';
import { useCancelBet } from '@/hooks/use-cancel-bet';
import { useWithdrawBet } from '@/hooks/use-withdraw-bet';

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
  const { cancelBet, isLoading: isCancelling } = useCancelBet();
  const { withdrawBet, isLoading: isWithdrawing } = useWithdrawBet();

  const proposerStake = (bet.totalCapital * BigInt(bet.proposerCapitalBps)) / 10000n;
  const funderPortion = bet.totalCapital - proposerStake;
  const pct = metadata?.outcomePrice ? Math.round(parseFloat(metadata.outcomePrice) * 100) : 50;
  const isYesOutcome = metadata?.isYesOutcome ?? true;
  const status = statusConfig[bet.status] ?? statusConfig[BetStatus.Proposed];
  const StatusIcon = status.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-dark-border bg-dark-surface p-5 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {metadata?.marketImage && (
          <img
            src={metadata.marketImage}
            alt=""
            className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-white/5"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[15px] text-white leading-snug line-clamp-2">
            {metadata?.marketQuestion || 'Polymarket Bet'}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
              style={{
                background: isYesOutcome ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: isYesOutcome ? '#22c55e' : '#ef4444',
              }}
            >
              {isYesOutcome ? 'Yes' : 'No'}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{pct}¢</span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
              style={{
                background: role === 'believer' ? 'rgba(236, 194, 94, 0.12)' : 'rgba(97, 166, 251, 0.12)',
                color: role === 'believer' ? '#D4AD4A' : '#61A6FB',
              }}
            >
              {role === 'believer' ? <TrendingUp className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
              {role === 'believer' ? 'Believer' : 'Backer'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-dark-border bg-[#111113] px-3 py-2.5">
          <span className="text-[11px] text-muted-foreground font-medium">
            {role === 'believer' ? 'Your Stake' : 'Your Funding'}
          </span>
          <p className="text-lg font-bold text-white mt-0.5 font-mono">
            ${role === 'believer' ? formatUsdc(proposerStake) : formatUsdc(funderPortion)}
          </p>
        </div>
        <div className="rounded-xl border border-dark-border bg-[#111113] px-3 py-2.5">
          <span className="text-[11px] text-muted-foreground font-medium">Total Position</span>
          <p className="text-lg font-bold text-white mt-0.5 font-mono">
            ${formatUsdc(bet.totalCapital)}
          </p>
        </div>
      </div>

      {/* Trade Structure Bar */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Trade Structure</span>
        <div className="mt-1.5 h-2 rounded-full overflow-hidden flex">
          <div className="h-full rounded-l-full" style={{ width: '20%', background: 'linear-gradient(90deg, #C8A43A, #D4AD4A)' }} />
          <div className="h-full rounded-r-full" style={{ width: '80%', background: 'linear-gradient(90deg, #4A80C4, #5B93D4)' }} />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] font-medium" style={{ color: '#D4AD4A' }}>20% Believer</span>
          <span className="text-[10px] font-medium" style={{ color: '#5B93D4' }}>80% Backer</span>
        </div>
      </div>

      {/* Counterparty */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <User className="w-3 h-3" />
        <span>
          {role === 'believer'
            ? bet.funder !== '0x0000000000000000000000000000000000000000' ? `Backed by ${formatAddress(bet.funder)}` : 'Awaiting Backer'
            : `Proposed by ${formatAddress(bet.proposer)}`
          }
        </span>
      </div>

      {/* Status */}
      <div
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl"
        style={{ background: status.bg, border: `1px solid ${status.color}25` }}
      >
        <StatusIcon className="w-4 h-4" style={{ color: status.color }} />
        <span className="text-sm font-medium" style={{ color: status.color }}>{status.label}</span>
      </div>

      {/* CTA Buttons */}
      {bet.status === BetStatus.Proposed && role === 'believer' && (
        <button
          onClick={() => cancelBet(betView.betId)}
          disabled={isCancelling}
          className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#ef4444',
          }}
        >
          {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          {isCancelling ? 'Cancelling...' : 'Cancel Bet'}
        </button>
      )}

      {bet.status === BetStatus.Closed && (
        <button
          onClick={() => withdrawBet(betView.betId)}
          disabled={isWithdrawing}
          className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          style={{
            background: 'rgba(97, 166, 251, 0.08)',
            border: '1px solid rgba(97, 166, 251, 0.25)',
            color: '#61A6FB',
          }}
        >
          {isWithdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
          {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
        </button>
      )}
    </motion.div>
  );
}
