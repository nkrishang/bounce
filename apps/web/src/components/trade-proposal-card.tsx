'use client';

import { useState, useMemo } from 'react';
import { Globe, MessageCircle, Clock, ArrowRight, ShieldCheck, Search } from 'lucide-react';
import { type TradeView, type TokenMeta, formatAddress } from '@bounce/shared';
import { formatUnits } from 'viem';
import { useTokenMeta } from '@/hooks/use-token';
import { useTokenList } from '@/hooks/use-token-list';
import { TokenAvatar } from './token-avatar';
import { CountdownTimer } from './countdown-timer';
import { InvestModal } from './invest-modal';

interface TradeProposalCardProps {
  trade: TradeView;
}

export function TradeProposalCard({ trade }: TradeProposalCardProps) {
  const [showModal, setShowModal] = useState(false);
  const { data: buyTokenMeta } = useTokenMeta(trade.chainId, trade.data.buyToken);
  const { data: tokenList = [] } = useTokenList();

  const tokenFromList = useMemo(() => {
    return tokenList.find(
      (t) => t.address.toLowerCase() === trade.data.buyToken.toLowerCase()
    );
  }, [tokenList, trade.data.buyToken]);

  const displayTokenMeta = useMemo((): TokenMeta | null => {
    if (tokenFromList) {
      return {
        address: tokenFromList.address,
        symbol: tokenFromList.symbol,
        name: tokenFromList.name,
        decimals: buyTokenMeta?.decimals ?? 18,
        logoUrl: tokenFromList.logoURI,
      };
    }
    return buyTokenMeta ?? null;
  }, [tokenFromList, buyTokenMeta]);

  const sellAmount = formatUnits(BigInt(trade.data.sellAmount), 6);
  const totalPosition = formatUnits(BigInt(trade.data.sellAmount) * 5n, 6);

  const logoUrl = tokenFromList?.logoURI ?? tokenFromList?.imageThumbUrl ?? displayTokenMeta?.logoUrl;
  const socialLinks = tokenFromList?.socialLinks;

  const believerPct = 20;
  const backerPct = 80;

  return (
    <>
      <div className="w-[360px] flex-shrink-0 rounded-2xl border border-dark-border bg-dark-surface p-6 flex flex-col gap-5">
        {/* Token header + Expiry */}
        <div className="flex items-start justify-between gap-4">
          {/* Token info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 rounded-xl bg-[#1e1e22] border border-[#2a2a2e]/50 p-1.5">
              <TokenAvatar
                src={logoUrl}
                name={trade.data.buyToken}
                alt={displayTokenMeta?.symbol}
                size={36}
                rounded="lg"
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[15px] text-white truncate leading-tight">
                {displayTokenMeta?.name || 'Unknown'}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground font-medium">
                  {displayTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
                </span>
                {/* Social links inline */}
                <div className="flex items-center gap-1.5">
                  {socialLinks?.website && (
                    <a
                      href={socialLinks.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {socialLinks?.twitter && (
                    <a
                      href={socialLinks.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>
                  )}
                  {socialLinks?.telegram && (
                    <a
                      href={socialLinks.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {socialLinks?.discord && (
                    <a
                      href={socialLinks.discord}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Expiry badge */}
          <div className="flex-shrink-0">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-white/10 bg-white/[0.04]">
              <Clock size={12} className="text-muted-foreground" />
              <span className="text-xs font-mono font-semibold text-[#ccc]">
                <CountdownTimer expirationTimestamp={trade.data.expirationTimestamp} />
              </span>
            </div>
          </div>
        </div>

        {/* Stats boxes */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-dark-border bg-[#111113] px-4 py-3">
            <span className="text-[11px] text-muted-foreground font-medium">Total Purchase</span>
            <p className="text-xl font-bold text-white mt-1 font-mono">
              ${parseFloat(totalPosition).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div
            className="rounded-xl px-4 py-3"
            style={{
              border: '1px solid rgba(34, 197, 94, 0.35)',
              background: 'rgba(34, 197, 94, 0.08)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-success" />
              <span className="text-[11px] text-success font-semibold">Protected</span>
            </div>
            <p className="text-xl font-bold text-white mt-1 font-mono">
              ${parseFloat(sellAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Trade Structure */}
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Trade Structure
          </span>
          <div className="mt-2 h-2.5 rounded-full overflow-hidden flex">
            <div
              className="h-full rounded-l-full"
              style={{
                width: `${believerPct}%`,
                background: 'linear-gradient(90deg, #C8A43A, #D4AD4A)',
              }}
            />
            <div
              className="h-full rounded-r-full"
              style={{
                width: `${backerPct}%`,
                background: 'linear-gradient(90deg, #4A80C4, #5B93D4)',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] font-medium" style={{ color: '#D4AD4A' }}>
              {believerPct}% Believer Stake
            </span>
            <span className="text-[11px] font-medium" style={{ color: '#5B93D4' }}>
              {backerPct}% You Fund
            </span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowModal(true)}
          className="group relative w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all duration-300 overflow-hidden animate-btn-glow-blue hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'rgba(97, 166, 251, 0.08)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(97, 166, 251, 0.25)',
            color: '#61A6FB',
          }}
        >
          {/* Shine sweep */}
          <span
            className="absolute inset-0 animate-btn-shine-blue pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(97, 166, 251, 0.15), transparent)',
              width: '40%',
            }}
          />
          <span
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: 'linear-gradient(135deg, rgba(97, 166, 251, 0.12), rgba(75, 140, 220, 0.06))',
            }}
          />
          <span className="relative z-10 flex items-center gap-2">
            Protected Buy
            <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>

      <InvestModal
        trade={trade}
        buyTokenMeta={displayTokenMeta}
        open={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
