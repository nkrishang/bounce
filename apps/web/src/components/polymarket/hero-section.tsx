'use client';

import { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, Calendar, TrendingUp, ShieldCheck, ArrowDown } from 'lucide-react';
import type { PolymarketEvent, PolymarketMarket, PolymarketToken } from '@bounce/shared';
import { api } from '@/lib/api';

const Liveline = dynamic(
  () => import('liveline').then((mod) => ({ default: mod.Liveline })),
  { ssr: false }
);

// ─── Constants ───────────────────────────────────────────────────────────────

const GOLD = '#D4AD4A';
const BLUE = '#61A6FB';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTokens(market: PolymarketMarket): PolymarketToken[] {
  let tokens = market.tokens;
  if (!tokens || tokens.length === 0) {
    try {
      const outcomes: string[] =
        typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || [];
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

function formatVolume(vol: number) {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getChanceColor(probability: number) {
  if (probability <= 0.25) return '#c23b3b';
  if (probability <= 0.5) return '#f59e0b';
  if (probability > 0.9) return '#16a34a';
  return '#22c55e';
}

function formatPct(price: number): string {
  const pct = price * 100;
  if (pct < 1) return '<1%';
  if (pct > 99) return '>99%';
  return `${Math.round(pct)}%`;
}

// ─── Chance Gauge ────────────────────────────────────────────────────────────

function ChanceGauge({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100);
  const color = getChanceColor(probability);
  const r = 30;
  const sw = 6;
  const svgW = (r + sw) * 2;
  const svgH = r + sw;
  const cx = svgW / 2;
  const cy = r + sw / 2;
  const totalLength = Math.PI * r;
  const filledLength = Math.max(probability * totalLength, sw);
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div className="flex flex-col items-center shrink-0">
      <span className="text-white font-bold leading-none text-[17px]">{pct}%</span>
      <span className="text-white/40 text-[9px] mt-0.5">chance</span>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mt-0.5">
        <path d={path} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={sw} strokeLinecap="round" />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${totalLength}`}
        />
      </svg>
    </div>
  );
}

// ─── Funding Bar Animation ───────────────────────────────────────────────────

function FundingBar() {
  return (
    <motion.div
      className="w-full max-w-md mx-auto"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.5 }}
    >
      <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden flex">
        <motion.div
          className="h-full"
          style={{ background: GOLD, borderRadius: '9999px 0 0 9999px' }}
          initial={{ width: 0 }}
          animate={{ width: '20%' }}
          transition={{ duration: 0.8, delay: 0.7, ease: 'easeOut' }}
        />
        <motion.div
          className="h-full"
          style={{ background: BLUE, borderRadius: '0 9999px 9999px 0' }}
          initial={{ width: 0 }}
          animate={{ width: '80%' }}
          transition={{ duration: 1.0, delay: 1.0, ease: 'easeOut' }}
        />
      </div>
      <div className="flex justify-between mt-2 text-xs font-medium">
        <span style={{ color: GOLD }} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: GOLD }} />
          Believer fronts 20% funds
        </span>
        <span style={{ color: BLUE }} className="flex items-center gap-1.5">
          Backer fills remaining 80%
          <span className="w-2 h-2 rounded-full" style={{ background: BLUE }} />
        </span>
      </div>
    </motion.div>
  );
}

// ─── Unified Hero Visual ─────────────────────────────────────────────────────

function HeroVisual({ events }: { events: PolymarketEvent[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (events.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % events.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [events.length]);

  const event = events[index];
  if (!event) return null;

  const market = event.markets[0];
  const tokens = parseTokens(market);
  const yesToken = tokens.find((t) => t.outcome.toLowerCase() === 'yes');
  const noToken = tokens.find((t) => t.outcome.toLowerCase() === 'no');
  const probability = yesToken?.price ?? 0.5;
  const noProbability = noToken?.price ?? 1 - probability;

  return (
    <div
      className="w-full max-w-[820px] rounded-2xl overflow-hidden border border-white/[0.06]"
      style={{ background: '#1E2428' }}
    >
      <div className="flex flex-col lg:flex-row">
        {/* Left: Rotating bet content */}
        <div className="lg:w-[380px] shrink-0 flex flex-col">
          {/* Animating bet info */}
          <div className="relative min-h-[280px] flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                className="flex flex-col flex-1"
              >
                {/* Header */}
                <div className="flex items-start gap-3 p-5 pb-3">
                  {event.image && (
                    <img
                      src={event.image}
                      alt={event.title}
                      className="w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-white/5"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[14px] text-white leading-snug line-clamp-2">
                      {event.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-white/40">
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
                  <ChanceGauge probability={probability} />
                </div>

                {/* Bet rows */}
                <div className="px-4 pb-4 space-y-2 mt-auto">
                  <BetRowDisplay isYes probability={probability} />
                  <BetRowDisplay isYes={false} probability={noProbability} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-white/[0.06]" />

        {/* Right: Liveline */}
        <div className="flex-1 min-w-0 border-t lg:border-t-0 border-white/[0.06]">
          <MockLiveline />
        </div>
      </div>
    </div>
  );
}

function BetRowDisplay({ isYes, probability }: { isYes: boolean; probability: number }) {
  return (
    <div
      className="rounded-xl px-3.5 py-3 flex items-center gap-2"
      style={{ background: isYes ? '#243A33' : '#39272B' }}
    >
      <span
        className="text-base font-bold w-9 shrink-0"
        style={{ color: isYes ? '#4ade80' : '#E03537' }}
      >
        {isYes ? 'Yes' : 'No'}
      </span>
      <span className="text-white/25 text-sm font-medium shrink-0">{formatPct(probability)}</span>
      <div className="flex-1" />
      <div
        className="h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap"
        style={{
          background: '#3E3D2A',
          border: '1px solid rgba(255, 242, 49, 0.25)',
          color: '#FFF231',
        }}
      >
        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
        3x<span className="hidden sm:inline"> PROFIT</span>
      </div>
      <div
        className="h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap"
        style={{
          background: '#1F304D',
          border: '1px solid rgba(48, 144, 255, 0.25)',
          color: '#3090FF',
        }}
      >
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        20%<span className="hidden sm:inline"> Protection</span>
      </div>
    </div>
  );
}

// ─── Liveline Chart ──────────────────────────────────────────────────────────

function MockLiveline() {
  const [data, setData] = useState<{ time: number; value: number }[]>([]);
  const [value, setValue] = useState(50);
  const valueRef = useRef(50);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const nowSec = Date.now() / 1000;
    const seed: { time: number; value: number }[] = [];
    let v = 45 + Math.random() * 10;
    for (let i = 30; i >= 0; i--) {
      v += (Math.random() - 0.48) * 1.5;
      v = Math.max(20, Math.min(80, v));
      seed.push({ time: nowSec - i, value: v });
    }
    valueRef.current = v;
    setData(seed);
    setValue(v);

    const interval = setInterval(() => {
      const drift = (Math.random() - 0.48) * 1.2;
      valueRef.current = Math.max(20, Math.min(80, valueRef.current + drift));
      const point = { time: Date.now() / 1000, value: valueRef.current };
      setData((prev) => [...prev.slice(-60), point]);
      setValue(valueRef.current);
    }, 800);

    return () => clearInterval(interval);
  }, []);

  if (!mounted || data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 280 }}>
      <Liveline
        data={data}
        value={value}
        color="#D4AD4A"
        theme="dark"
        grid
        badge
        fill
        pulse
        scrub={false}
        momentum
        window={30}
        exaggerate
        formatValue={(v: number) => `$${v.toFixed(2)}`}
      />
    </div>
  );
}

// ─── Main Hero ───────────────────────────────────────────────────────────────

export function HeroSection() {
  const [events, setEvents] = useState<PolymarketEvent[]>([]);

  useEffect(() => {
    api
      .get<{ data: PolymarketEvent[] }>('/polymarket/events?limit=6&offset=0&order=volume24hr')
      .then((res) => {
        const active = (res.data || []).filter(
          (e) => e.active && !e.closed && e.markets.length === 1
        );
        setEvents(active.slice(0, 5));
      })
      .catch(() => {});
  }, []);

  return (
    <section className="relative overflow-hidden" style={{ fontFamily: "'Satoshi', var(--font-sans), system-ui, sans-serif" }}>
      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header block */}
        <div className="text-center mx-auto mb-12">
          <motion.h1
            className="font-black leading-[1] tracking-tighter text-white whitespace-nowrap w-fit mx-auto"
            style={{ fontSize: 'min(10vw, 8rem)' }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            Capital{' '}
            <span className="text-white/30 font-light">x</span>{' '}
            Conviction
          </motion.h1>

          <motion.div
            className="mt-5 flex flex-col items-center gap-3 text-base sm:text-lg text-white/55 max-w-lg mx-auto"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <p>
              <span style={{ color: GOLD }} className="font-semibold">Believers</span>{' '}
              propose bets and earn{' '}
              <span className="font-bold text-white" style={{ background: `${GOLD}25`, padding: '1px 6px', borderRadius: '4px', border: `1px solid ${GOLD}40` }}>3x profit</span>.
            </p>
            <p>
              <span style={{ color: BLUE }} className="font-semibold">Backers</span>{' '}
              fund bets and get{' '}
              <span className="font-bold text-white" style={{ background: `${BLUE}25`, padding: '1px 6px', borderRadius: '4px', border: `1px solid ${BLUE}40` }}>20% loss protection</span>.
            </p>
          </motion.div>

          {/* Funding bar */}
          <div className="mt-8">
            <FundingBar />
          </div>

          {/* Get started button */}
          <motion.button
            onClick={() => document.getElementById('markets')?.scrollIntoView({ behavior: 'smooth' })}
            className="group relative mt-8 inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full text-sm font-bold text-black overflow-hidden cursor-pointer"
            style={{
              background: `linear-gradient(135deg, #E8C44A 0%, ${GOLD} 50%, #C49B2A 100%)`,
              boxShadow: `0 0 20px rgba(212, 173, 74, 0.3), 0 0 60px rgba(212, 173, 74, 0.1), 0 4px 12px rgba(0, 0, 0, 0.3)`,
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            whileHover={{ scale: 1.04, boxShadow: `0 0 30px rgba(212, 173, 74, 0.5), 0 0 80px rgba(212, 173, 74, 0.2), 0 6px 20px rgba(0, 0, 0, 0.35)` }}
            whileTap={{ scale: 0.97 }}
          >
            {/* Shimmer sweep */}
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
              }}
            />
            <span className="relative z-10">Get started</span>
            <motion.span
              className="relative z-10 flex items-center"
              animate={{ y: [0, 3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ArrowDown className="w-4 h-4" />
            </motion.span>
          </motion.button>
        </div>

        {/* Hero visual: Unified bet card + Liveline */}
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          {events.length > 0 && <HeroVisual events={events} />}
        </motion.div>
      </div>
    </section>
  );
}
