'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Calendar, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import type { PolymarketEvent, PolymarketMarket } from '@bounce/shared';

interface MarketCardProps {
  event: PolymarketEvent;
  onPropose: (event: PolymarketEvent, market: PolymarketMarket, tokenId: string, outcome: string, price: number) => void;
}

export function MarketCard({ event, onPropose }: MarketCardProps) {
  const [expanded, setExpanded] = useState(false);
  const displayMarkets = expanded ? event.markets : event.markets.slice(0, 2);

  const formatVolume = (vol: number) => {
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <motion.div
      whileHover={{ scale: 1.005 }}
      className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden transition-all"
    >
      {/* Header with image */}
      <div className="flex items-start gap-4 p-5 pb-3">
        {event.image && (
          <img
            src={event.image}
            alt={event.title}
            className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-white/5"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[15px] text-white leading-snug line-clamp-2">
            {event.title}
          </h3>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              {formatVolume(event.volume_num || event.volume)}
            </span>
            {(event.endDate || event.end_date) && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(event.endDate || event.end_date)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Markets */}
      <div className="px-5 pb-4 space-y-2.5">
        {displayMarkets.map((market) => {
          // Parse tokens from Gamma API response
          let tokens = market.tokens;
          if (!tokens || tokens.length === 0) {
            try {
              const outcomes: string[] = typeof market.outcomes === 'string'
                ? JSON.parse(market.outcomes)
                : (market.outcomes || []);
              // Gamma API uses outcomePrices (camelCase) or outcome_prices (snake_case)
              const pricesRaw = (market as any).outcomePrices || market.outcome_prices || '[]';
              const prices: string[] = typeof pricesRaw === 'string' ? JSON.parse(pricesRaw) : pricesRaw;
              const tokenIdsRaw = (market as any).clobTokenIds || '[]';
              const tokenIds: string[] = typeof tokenIdsRaw === 'string' ? JSON.parse(tokenIdsRaw) : tokenIdsRaw;
              tokens = outcomes.map((outcome: string, i: number) => ({
                token_id: tokenIds[i] || `${market.conditionId || market.condition_id}-${i}`,
                outcome,
                price: parseFloat(prices[i] || '0.5'),
                winner: false,
              }));
            } catch {
              tokens = [];
            }
          }

          return (
            <div key={market.id} className="rounded-xl bg-[#111113] border border-dark-border p-3.5">
              {event.markets.length > 1 && (
                <p className="text-xs text-muted-foreground mb-2.5 line-clamp-1">{market.question}</p>
              )}
              <div className="space-y-1.5">
                {tokens.map((token) => {
                  const pct = Math.round(token.price * 100);
                  return (
                    <button
                      key={token.token_id}
                      onClick={() => onPropose(event, market, token.token_id, token.outcome, token.price)}
                      className="group w-full flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="text-sm text-[#ccc] flex-1 text-left truncate">{token.outcome}</span>
                      {/* Probability bar */}
                      <div className="w-24 h-2 rounded-full bg-white/[0.06] overflow-hidden flex-shrink-0">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: token.outcome.toLowerCase() === 'yes'
                              ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                              : token.outcome.toLowerCase() === 'no'
                              ? 'linear-gradient(90deg, #ef4444, #f87171)'
                              : 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                          }}
                        />
                      </div>
                      <span className="font-mono text-sm font-bold text-white w-12 text-right">
                        {pct}¢
                      </span>
                      <span
                        className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded-md flex-shrink-0"
                        style={{
                          background: 'rgba(236, 194, 94, 0.12)',
                          color: '#ECC25E',
                        }}
                      >
                        Bet
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {event.markets.length > 2 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-white transition-colors"
          >
            {expanded ? (
              <>Show Less <ChevronUp className="w-3.5 h-3.5" /></>
            ) : (
              <>{event.markets.length - 2} more markets <ChevronDown className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
