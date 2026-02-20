'use client';

import { useRef, useState, useEffect } from 'react';
import { DollarSign, Calendar, ChevronDown, TrendingUp, ShieldCheck } from 'lucide-react';
import type { PolymarketEvent, PolymarketMarket, PolymarketToken } from '@bounce/shared';

interface MarketCardProps {
  event: PolymarketEvent;
  onPropose: (event: PolymarketEvent, market: PolymarketMarket, tokenId: string, outcome: string, price: number) => void;
}

function parseTokens(market: PolymarketMarket): PolymarketToken[] {
  let tokens = market.tokens;
  if (!tokens || tokens.length === 0) {
    try {
      const outcomes: string[] = typeof market.outcomes === 'string'
        ? JSON.parse(market.outcomes)
        : (market.outcomes || []);
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
  return tokens || [];
}

function getChanceColor(probability: number) {
  if (probability <= 0.25) return '#c23b3b';
  if (probability <= 0.50) return '#f59e0b';
  if (probability > 0.90) return '#16a34a';
  return '#22c55e';
}

function ChanceGauge({ probability, size = 'default' }: { probability: number; size?: 'default' | 'small' }) {
  const pct = Math.round(probability * 100);
  const color = getChanceColor(probability);

  const isSmall = size === 'small';
  const r = isSmall ? 18 : 30;
  const sw = isSmall ? 4.5 : 6;
  const svgW = (r + sw) * 2;
  const svgH = r + sw;
  const cx = svgW / 2;
  const cy = r + sw / 2;

  const totalLength = Math.PI * r;
  const filledLength = Math.max(probability * totalLength, sw);
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div className="flex flex-col items-center shrink-0">
      <span className={`text-white font-bold leading-none ${isSmall ? 'text-[11px]' : 'text-[17px]'}`}>{pct}%</span>
      {!isSmall && <span className="text-white/40 text-[9px] mt-0.5">chance</span>}
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mt-0.5">
        <path d={path} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={sw} strokeLinecap="round" />
        <path d={path} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${filledLength} ${totalLength}`}
        />
      </svg>
    </div>
  );
}

function formatPct(price: number): string {
  const pct = price * 100;
  if (pct < 1) return '<1%';
  if (pct > 99) return '>99%';
  return `${Math.round(pct)}%`;
}

function BetRow({ isYes, probability }: { isYes: boolean; probability: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="rounded-xl px-4 py-4 flex items-center gap-2 overflow-hidden transition-colors duration-200 cursor-pointer"
      style={{
        background: hovered
          ? (isYes ? '#1e4a38' : '#4d2428')
          : (isYes ? '#243A33' : '#39272B'),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Label slot: animates between "Yes"/"No" and probability % */}
      <div className="relative w-11 h-7 shrink-0 overflow-hidden">
        <span
          className="absolute inset-0 flex items-center text-xl font-bold transition-all duration-200"
          style={{
            color: isYes ? '#4ade80' : '#E03537',
            opacity: hovered ? 0 : 1,
            transform: hovered ? 'translateY(-8px)' : 'translateY(0)',
          }}
        >
          {isYes ? 'Yes' : 'No'}
        </span>
        <span
          className="absolute inset-0 flex items-center text-xl font-bold transition-all duration-200"
          style={{
            color: isYes ? '#4ade80' : '#E03537',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateY(0)' : 'translateY(8px)',
          }}
        >
          {formatPct(probability)}
        </span>
      </div>
      <span className="text-white/30 text-base shrink-0">@</span>
      <button
        className="h-9 px-3 rounded-xl text-sm font-bold shrink-0 flex items-center gap-1.5 transition-shadow duration-200 hover:shadow-[0_0_18px_rgba(255,242,49,0.55)]"
        style={{
          background: '#3E3D2A',
          border: '1.5px solid rgba(255, 242, 49, 0.35)',
          color: '#FFF231',
        }}
      >
        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
        3x PROFIT
      </button>
      <span className="text-white/30 text-sm shrink-0">/</span>
      <button
        className="h-9 shrink-0 whitespace-nowrap px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-shadow duration-200 hover:shadow-[0_0_18px_rgba(48,144,255,0.55)]"
        style={{
          background: '#1F304D',
          border: '1.5px solid rgba(48, 144, 255, 0.35)',
          color: '#3090FF',
        }}
      >
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        20% Protection
      </button>
    </div>
  );
}

function marketInterestScore(market: PolymarketMarket): number {
  const tokens = parseTokens(market);
  const yes = tokens.find((t) => t.outcome.toLowerCase() === 'yes');
  const pYes = yes?.price ?? 0.5;
  // Dead extremes sink to bottom
  if (pYes <= 0.02 || pYes >= 0.98) return -1;
  const contention = 1 - Math.abs(pYes - 0.5) / 0.5;
  const vol = market.volumeNum || market.volume_num || parseFloat(market.volume || '0');
  return Math.pow(contention, 2) * Math.log1p(vol);
}

function ScrollableMarkets({ markets }: { markets: PolymarketMarket[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setHasOverflow(el.scrollHeight > el.clientHeight + 2);
      setAtTop(el.scrollTop < 2);
      setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [markets]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop < 2);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };

  const FADE = '#1E2428';

  return (
    <div className="relative overflow-hidden">
      {/* Scrollable content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="px-4 pb-5 space-y-4 overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20"
        style={{ maxHeight: 360 }}
      >
        {[...markets].sort((a, b) => marketInterestScore(b) - marketInterestScore(a)).map((market) => {
          const tokens = parseTokens(market);
          const yes = tokens.find((t) => t.outcome.toLowerCase() === 'yes');
          const no = tokens.find((t) => t.outcome.toLowerCase() === 'no');
          const yesPrice = yes?.price ?? 0.5;
          const noPrice = no?.price ?? (1 - yesPrice);
          return (
            <div key={market.id}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-white/50 leading-snug line-clamp-2">{market.question}</p>
                <ChanceGauge probability={yesPrice} size="small" />
              </div>
              <div className="space-y-2">
                <BetRow isYes={true} probability={yesPrice} />
                <BetRow isYes={false} probability={noPrice} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Top inner shadow — fades in once scrolled */}
      <div
        className="absolute top-0 left-0 right-0 h-10 pointer-events-none transition-opacity duration-300"
        style={{
          background: `linear-gradient(to bottom, ${FADE} 0%, transparent 100%)`,
          opacity: hasOverflow && !atTop ? 1 : 0,
        }}
      />

      {/* Bottom inner shadow + scroll hint */}
      {hasOverflow && !atBottom && (
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none flex flex-col items-center justify-end transition-all duration-300"
          style={{
            height: atTop ? 88 : 48,
            background: `linear-gradient(to top, ${FADE} 30%, transparent 100%)`,
          }}
        >
          {atTop && (
            <div className="flex flex-col items-center gap-0.5 pb-3">
              <span className="text-[10px] font-medium text-white/40 tracking-wide">Scroll to view more</span>
              <ChevronDown className="w-3.5 h-3.5 text-white/30 animate-bounce" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MarketCard({ event }: MarketCardProps) {
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

  const isSingleBinary = event.markets.length === 1;
  const singleTokens = isSingleBinary ? parseTokens(event.markets[0]) : [];
  const yesToken = singleTokens.find((t) => t.outcome.toLowerCase() === 'yes');
  const noToken = singleTokens.find((t) => t.outcome.toLowerCase() === 'no');
  const probability = yesToken?.price ?? 0.5;
  const noProbability = noToken?.price ?? (1 - probability);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#1E2428' }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-5 pb-4">
        {event.image && (
          <img
            src={event.image}
            alt={event.title}
            className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-white/5"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[15px] text-white leading-snug line-clamp-2">
            {event.title}
          </h3>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40">
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
        {isSingleBinary && <ChanceGauge probability={probability} />}
      </div>

      {/* Markets */}
      {isSingleBinary ? (
        <div className="px-4 pb-5 space-y-2">
          <BetRow isYes={true} probability={probability} />
          <BetRow isYes={false} probability={noProbability} />
        </div>
      ) : (
        <ScrollableMarkets markets={event.markets} />
      )}
    </div>
  );
}
