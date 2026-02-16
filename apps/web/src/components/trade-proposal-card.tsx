'use client';

import { useState, useMemo } from 'react';
import { Globe, MessageCircle } from 'lucide-react';
import { type TradeView, type TokenMeta, formatAddress } from '@thesis/shared';
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

  return (
    <>
      <div className="w-[280px] flex-shrink-0 rounded-xl bg-dark-surface border border-dark-border p-5 flex flex-col gap-4">
        {/* Token header */}
        <div className="flex items-center gap-3">
          <TokenAvatar
            src={logoUrl}
            name={trade.data.buyToken}
            alt={displayTokenMeta?.symbol}
            size={40}
          />
          <div className="min-w-0">
            <h3 className="font-semibold text-dark-surface-foreground truncate">
              {displayTokenMeta?.name || 'Unknown'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {displayTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
            </p>
          </div>
        </div>

        {/* Social links - fixed height to keep cards aligned */}
        <div className="flex items-center gap-2 h-4">
          {socialLinks?.twitter && (
            <a
              href={socialLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
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
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
          {socialLinks?.website && (
            <a
              href={socialLinks.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Globe className="w-4 h-4" />
            </a>
          )}
          {socialLinks?.discord && (
            <a
              href={socialLinks.discord}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
        </div>

        {/* Stats */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Purchase</span>
            <span className="font-mono font-medium text-success">
              ${parseFloat(totalPosition).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Protection</span>
            <span className="font-mono font-medium text-success">
              ${parseFloat(sellAmount).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Expires in</span>
            <span className="font-mono text-dark-surface-foreground">
              <CountdownTimer expirationTimestamp={trade.data.expirationTimestamp} />
            </span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          Protected Buy
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
