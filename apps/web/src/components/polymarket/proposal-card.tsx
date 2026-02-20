'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, ArrowRight, ShieldCheck, User } from 'lucide-react';
import type { Proposal } from '@bounce/shared';
import { formatAddress } from '@bounce/shared';
import { formatUnits } from 'viem';
import { FundProposalModal } from './fund-proposal-modal';

interface ProposalCardProps {
  proposal: Proposal;
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const [showFundModal, setShowFundModal] = useState(false);

  const proposerStake = formatUnits(BigInt(proposal.proposerContribution), 6);
  const totalPosition = formatUnits(BigInt(proposal.totalCapital), 6);
  const funderPortion = parseFloat(totalPosition) - parseFloat(proposerStake);
  const pct = proposal.outcomePrice ? Math.round(parseFloat(proposal.outcomePrice) * 100) : 50;

  return (
    <>
      <div className="w-[360px] flex-shrink-0 rounded-2xl border border-dark-border bg-dark-surface p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          {proposal.marketImage && (
            <img
              src={proposal.marketImage}
              alt=""
              className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-white/5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-[15px] text-white leading-snug line-clamp-2">
              {proposal.marketQuestion || 'Polymarket Bet'}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                style={{
                  background: proposal.isYesOutcome ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: proposal.isYesOutcome ? '#22c55e' : '#ef4444',
                }}
              >
                {proposal.isYesOutcome ? 'Yes' : 'No'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{pct}¢</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-dark-border bg-[#111113] px-4 py-3">
            <span className="text-[11px] text-muted-foreground font-medium">Total Position</span>
            <p className="text-xl font-bold text-white mt-1 font-mono">
              ${parseFloat(totalPosition).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div
            className="rounded-xl px-4 py-3"
            style={{ border: '1px solid rgba(34, 197, 94, 0.35)', background: 'rgba(34, 197, 94, 0.08)' }}
          >
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-success" />
              <span className="text-[11px] text-success font-semibold">Protected</span>
            </div>
            <p className="text-xl font-bold text-white mt-1 font-mono">
              ${parseFloat(proposerStake).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Trade Structure Bar */}
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Trade Structure</span>
          <div className="mt-2 h-2.5 rounded-full overflow-hidden flex">
            <div className="h-full rounded-l-full" style={{ width: '20%', background: 'linear-gradient(90deg, #C8A43A, #D4AD4A)' }} />
            <div className="h-full rounded-r-full" style={{ width: '80%', background: 'linear-gradient(90deg, #4A80C4, #5B93D4)' }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] font-medium" style={{ color: '#D4AD4A' }}>20% Believer</span>
            <span className="text-[11px] font-medium" style={{ color: '#5B93D4' }}>80% You Fund</span>
          </div>
        </div>

        {/* Proposer info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <User className="w-3 h-3" />
          <span>Proposed by {formatAddress(proposal.proposer)}</span>
        </div>

        {/* CTA */}
        {proposal.status === 'PROPOSED' && (
          <button
            onClick={() => setShowFundModal(true)}
            className="group relative w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all duration-300 overflow-hidden hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'rgba(97, 166, 251, 0.08)',
              border: '1px solid rgba(97, 166, 251, 0.25)',
              color: '#61A6FB',
            }}
          >
            <span className="relative z-10 flex items-center gap-2">
              Protected Buy — ${funderPortion.toLocaleString()} USDC
              <ArrowRight size={16} />
            </span>
          </button>
        )}

        {proposal.status !== 'PROPOSED' && (
          <div className="py-3 rounded-xl bg-white/5 text-center">
            <span className="text-sm text-muted-foreground font-medium capitalize">{proposal.status.toLowerCase()}</span>
          </div>
        )}
      </div>

      <FundProposalModal
        proposal={proposal}
        open={showFundModal}
        onClose={() => setShowFundModal(false)}
      />
    </>
  );
}
