'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Shield, Lock } from 'lucide-react';
import { useTokenList } from '@/hooks/use-token-list';
import { TokenSlotMachine } from './token-slot-machine';

export function HeroSection() {
  const cachedLogos = useRef<string[]>([]);
  const { data: tokens = [] } = useTokenList();

  if (cachedLogos.current.length === 0 && tokens.length > 0) {
    cachedLogos.current = tokens
      .map((t) => t.logoURI)
      .filter((uri): uri is string => !!uri);
  }

  const logos = cachedLogos.current;

  return (
    <section className="py-16 lg:py-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-12">
          {/* Hero Copy */}
          <motion.div
            className="w-fit text-center lg:text-left"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <h1 className="text-[clamp(2rem,7vw,6rem)] font-bold leading-[1.1] tracking-tight whitespace-nowrap">
              Leverage for{' '}
              <span style={{ color: '#ECC25E' }}>Believers</span>
              <span className="text-[#888888]">.</span>
              <br />
              Protection for{' '}
              <span style={{ color: '#61A6FB' }}>Backers</span>
              <span className="text-[#888888]">.</span>
            </h1>

            <div className="mt-6 flex items-center gap-2 text-sm sm:text-base text-[#888888] mx-auto lg:mx-0 w-fit">
              <Lock size={14} className="text-[#ECC25E]" />
              <span>Fully-onchain, 100% backed leverage and loss protection.</span>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-4 max-w-[80%] mx-auto lg:mx-0">
              {/* Believer card */}
              <div className="flex-1 rounded-xl border border-[#ECC25E]/20 bg-[#ECC25E]/[0.04] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-[#ECC25E]/15 flex items-center justify-center">
                    <TrendingUp size={15} style={{ color: '#ECC25E' }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#ECC25E' }}>Believers</span>
                </div>
                <p className="text-sm text-[#888888] leading-relaxed">
                  Spot a token you believe in and stake 20% of the trade. A Backer funds the rest. You take on first-loss risk in exchange for amplified upside.
                </p>
              </div>

              {/* Backer card */}
              <div className="flex-1 rounded-xl border border-[#61A6FB]/20 bg-[#61A6FB]/[0.04] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-[#61A6FB]/15 flex items-center justify-center">
                    <Shield size={15} style={{ color: '#61A6FB' }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#61A6FB' }}>Backers</span>
                </div>
                <p className="text-sm text-[#888888] leading-relaxed">
                  Fund the remaining 80% of a Believer&apos;s trade. Your downside is shielded — the Believer&apos;s 20% stake absorbs the first losses before yours is touched.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Token Slot Machine */}
          {logos.length > 0 && (
            <motion.div
              className="flex-shrink-0 w-full lg:w-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              <TokenSlotMachine logos={logos} />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
