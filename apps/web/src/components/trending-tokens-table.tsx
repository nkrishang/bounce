'use client';

import { ExternalLink, Globe, Loader2, MessageCircle, Send } from 'lucide-react';
import { useTokenList, type TokenInfo } from '@/hooks/use-token-list';

interface TrendingTokensTableProps {
  onBoostedBuy?: (token: TokenInfo) => void;
}

const CHAIN_META: Record<number, { logo: string; name: string }> = {
  137: { logo: '/logos/polygon-logo.svg', name: 'Polygon' },
  8453: { logo: '/logos/base-logo.svg', name: 'Base' },
  143: { logo: '/logos/monad-logo.svg', name: 'Monad' },
};

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '-';
  if (price < 0.0001) {
    const str = price.toFixed(20);
    const match = str.match(/^0\.0*[1-9]/);
    if (match) {
      const zeros = match[0].length - 3;
      const significant = price.toFixed(zeros + 4).slice(match[0].length - 1);
      return `$0.0${zeros > 0 ? String.fromCharCode(8320 + zeros) : ''}${significant}`;
    }
  }
  if (price < 1) return `$${price.toFixed(5)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatCompact(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return '-';
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function formatHolders(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

function PctCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  const pct = value * 100;
  const color = pct >= 0 ? 'text-success' : 'text-danger';
  return <span className={color}>{formatPct(value)}</span>;
}

function SocialLinks({ links }: { links: TokenInfo['socialLinks'] }) {
  if (!links) return null;

  const items: { url: string; icon: React.ReactNode; label: string }[] = [];

  if (links.website) {
    items.push({
      url: links.website,
      icon: <Globe className="w-3.5 h-3.5" />,
      label: 'Website',
    });
  }
  if (links.twitter) {
    items.push({
      url: links.twitter,
      icon: <span className="text-[10px] font-bold leading-none">𝕏</span>,
      label: 'Twitter',
    });
  }
  if (links.telegram) {
    items.push({
      url: links.telegram,
      icon: <Send className="w-3.5 h-3.5" />,
      label: 'Telegram',
    });
  }
  if (links.discord) {
    items.push({
      url: links.discord,
      icon: <MessageCircle className="w-3.5 h-3.5" />,
      label: 'Discord',
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      {items.map((item) => (
        <a
          key={item.label}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary transition-colors"
          title={item.label}
        >
          {item.icon}
        </a>
      ))}
    </div>
  );
}

export function TrendingTokensTable({ onBoostedBuy }: TrendingTokensTableProps) {
  const { data: tokens = [], isLoading, error } = useTokenList();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 text-danger">
        Failed to load trending tokens. Please try again.
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        No trending tokens found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-muted">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border">
            <th className="py-3 px-3 text-left font-medium w-14" />
            <th className="py-3 px-3 text-left font-medium">Token</th>
            <th className="py-3 px-3 text-right font-medium">Price</th>
            <th className="py-3 px-3 text-right font-medium">5m</th>
            <th className="py-3 px-3 text-right font-medium">1h</th>
            <th className="py-3 px-3 text-right font-medium">4h</th>
            <th className="py-3 px-3 text-right font-medium">24h</th>
            <th className="py-3 px-3 text-right font-medium">Volume</th>
            <th className="py-3 px-3 text-right font-medium">Mkt Cap</th>
            <th className="py-3 px-3 text-right font-medium">Holders</th>
            <th className="py-3 px-3 text-right font-medium">Trade</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => {
            const chain = CHAIN_META[token.networkId];
            const isPolygon = token.networkId === 137;
            const logoSrc = token.logoURI || token.imageThumbUrl;

            return (
              <tr
                key={`${token.networkId}-${token.address}`}
                className="border-b border-border/50 hover:bg-white/5 transition-colors"
              >
                {/* Chain icon */}
                <td className="py-4 px-3">
                  {chain ? (
                    <img
                      src={chain.logo}
                      alt={chain.name}
                      title={chain.name}
                      className="w-8 h-8 object-contain flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-5 h-5 rounded-full bg-muted-foreground/30 flex items-center justify-center text-[9px] font-bold text-white"
                      title={`Network ${token.networkId}`}
                    >
                      ?
                    </div>
                  )}
                </td>

                {/* Token */}
                <td className="py-4 px-3">
                  <div className="flex items-center gap-3">
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt={token.symbol}
                        className="w-10 h-10 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                        {token.symbol.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-foreground">{token.name}</span>
                        <span className="text-xs text-muted-foreground">{token.symbol}</span>
                      </div>
                      <SocialLinks links={token.socialLinks} />
                    </div>
                  </div>
                </td>

                {/* Price */}
                <td className="py-4 px-3 text-right text-sm font-mono text-foreground">
                  {formatPrice(token.priceUSD)}
                </td>

                {/* 5m */}
                <td className="py-4 px-3 text-right text-sm font-mono">
                  <PctCell value={token.change5m} />
                </td>

                {/* 1h */}
                <td className="py-4 px-3 text-right text-sm font-mono">
                  <PctCell value={token.change1h} />
                </td>

                {/* 4h */}
                <td className="py-4 px-3 text-right text-sm font-mono">
                  <PctCell value={token.change4h} />
                </td>

                {/* 24h */}
                <td className="py-4 px-3 text-right text-sm font-mono">
                  <PctCell value={token.change24h} />
                </td>

                {/* Volume */}
                <td className="py-4 px-3 text-right text-sm font-mono text-foreground">
                  {formatCompact(token.volume24h)}
                </td>

                {/* Mkt Cap */}
                <td className="py-4 px-3 text-right text-sm font-mono text-foreground">
                  {formatCompact(token.marketCap)}
                </td>

                {/* Holders */}
                <td className="py-4 px-3 text-right text-sm font-mono text-foreground">
                  {formatHolders(token.holders)}
                </td>

                {/* Trade */}
                <td className="py-4 px-3 text-right">
                  <button
                    onClick={() => isPolygon && onBoostedBuy?.(token)}
                    disabled={!isPolygon}
                    className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Boosted Buy
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
