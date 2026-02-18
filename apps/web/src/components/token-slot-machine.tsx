'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { TokenInfo } from '@/hooks/use-token-list';
import { TokenAvatar } from './token-avatar';

interface TokenSlotMachineProps {
  tokens: TokenInfo[];
}

const BADGE_HEIGHT = 64;
const BADGE_WIDTH_H = 200;
const GAP = 12;
const ITEM_SIZE_V = BADGE_HEIGHT + GAP;
const ITEM_SIZE_H = BADGE_WIDTH_H + GAP;
const SCROLL_DURATION = 30;

function formatChange(value: number | null | undefined): string {
  if (value == null) return '-';
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function TokenBadge({ token }: { token: TokenInfo }) {
  const change = token.change1h;
  const isPositive = change != null && change >= 0;
  const logoSrc = token.logoURI || token.imageThumbUrl;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#1a1a1e] border border-[#2a2a2e]/60 px-3 py-2 h-[64px] w-[200px] flex-shrink-0">
      <TokenAvatar
        src={logoSrc}
        name={token.address}
        alt={token.symbol}
        size={40}
        rounded="full"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate leading-tight">
          {token.name}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs font-semibold text-white/40">
            {token.symbol}
          </span>
          {change != null && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums ${
                isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {formatChange(change)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TokenSlotMachine({ tokens }: TokenSlotMachineProps) {
  const [col1, col2] = useMemo(() => {
    const mid = Math.ceil(tokens.length / 2);
    return [tokens.slice(0, mid), tokens.slice(mid)];
  }, [tokens]);

  if (tokens.length < 4) return null;

  return (
    <>
      {/* Vertical layout on xl+ */}
      <div className="hidden xl:flex gap-3 justify-end overflow-hidden h-[480px] relative">
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#111113] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#111113] to-transparent z-10 pointer-events-none" />

        <ScrollColumn tokens={col1} direction="up" axis="vertical" />
        <ScrollColumn tokens={col2} direction="down" axis="vertical" />
      </div>

      {/* Horizontal layout on smaller screens */}
      <div className="flex xl:hidden flex-col gap-3 overflow-hidden w-full h-[152px] relative">
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#111113] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#111113] to-transparent z-10 pointer-events-none" />

        <ScrollColumn tokens={col1} direction="up" axis="horizontal" />
        <ScrollColumn tokens={col2} direction="down" axis="horizontal" />
      </div>
    </>
  );
}

function ScrollColumn({
  tokens,
  direction,
  axis,
}: {
  tokens: TokenInfo[];
  direction: 'up' | 'down';
  axis: 'vertical' | 'horizontal';
}) {
  const tripled = useMemo(() => [...tokens, ...tokens, ...tokens], [tokens]);

  if (axis === 'horizontal') {
    const listSize = tokens.length * ITEM_SIZE_H;
    return (
      <div className="relative h-[68px] overflow-hidden">
        <motion.div
          className="flex flex-row gap-3"
          animate={{
            x: direction === 'up' ? [0, -listSize] : [-listSize, 0],
          }}
          transition={{
            x: {
              duration: SCROLL_DURATION,
              repeat: Infinity,
              ease: 'linear',
            },
          }}
        >
          {tripled.map((token, i) => (
            <TokenBadge key={`${token.address}-${i}`} token={token} />
          ))}
        </motion.div>
      </div>
    );
  }

  const listSize = tokens.length * ITEM_SIZE_V;
  return (
    <div className="relative w-[200px] overflow-hidden">
      <motion.div
        className="flex flex-col gap-3"
        animate={{
          y: direction === 'up' ? [0, -listSize] : [-listSize, 0],
        }}
        transition={{
          y: {
            duration: SCROLL_DURATION,
            repeat: Infinity,
            ease: 'linear',
          },
        }}
      >
        {tripled.map((token, i) => (
          <TokenBadge key={`${token.address}-${i}`} token={token} />
        ))}
      </motion.div>
    </div>
  );
}
