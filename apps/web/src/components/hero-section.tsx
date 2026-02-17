'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Shield } from 'lucide-react';
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
    <section className="relative py-14 lg:py-20 overflow-hidden">
      {/* Ambient glow backgrounds */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{
            background: 'radial-gradient(circle, #ECC25E 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute bottom-[-20%] right-[-5%] w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{
            background: 'radial-gradient(circle, #61A6FB 0%, transparent 70%)',
          }}
        />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-16">
          {/* Hero Copy */}
          <div className="w-fit text-center lg:text-left">
            {/* Pill badge */}
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#ECC25E]/20 bg-[#ECC25E]/[0.06] mb-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ECC25E] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ECC25E]" />
              </span>
              <span className="text-xs font-medium tracking-wide text-[#ECC25E] uppercase">
                Fully Onchain · 100% Backed
              </span>
            </motion.div>

            {/* Main headline */}
            <motion.h1
              className="text-[clamp(2.2rem,5.5vw,5rem)] font-extrabold leading-[1.05] tracking-[-0.03em]"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <span className="block">
                Leverage for{' '}
                <span
                  className="relative inline-block"
                  style={{
                    background: 'linear-gradient(135deg, #ECC25E 0%, #F5D97E 50%, #D4A030 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Believers
                  <motion.span
                    className="absolute -bottom-1 left-0 h-[3px] rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #ECC25E, #F5D97E)',
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.8, delay: 0.6, ease: 'easeOut' }}
                  />
                </span>
                <span className="text-[#333]">.</span>
              </span>
              <span className="block mt-1">
                Protection for{' '}
                <span
                  className="relative inline-block"
                  style={{
                    background: 'linear-gradient(135deg, #61A6FB 0%, #8BC1FF 50%, #4A8FE0 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Backers
                  <motion.span
                    className="absolute -bottom-1 left-0 h-[3px] rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #61A6FB, #8BC1FF)',
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.8, delay: 0.8, ease: 'easeOut' }}
                  />
                </span>
                <span className="text-[#333]">.</span>
              </span>
            </motion.h1>

            {/* Sub-tagline */}
            <motion.p
              className="mt-4 text-base text-[#888888] max-w-lg mx-auto lg:mx-0"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              The leveraged conviction protocol. Believers risk first for amplified gains.
              Backers earn yield, shielded from downside.
            </motion.p>

            {/* Role cards */}
            <motion.div
              className="mt-7 flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto lg:mx-0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              {/* Believer card */}
              <div className="group relative flex-1 rounded-2xl p-[1px] transition-all duration-300 hover:scale-[1.02]">
                <div
                  className="absolute inset-0 rounded-2xl opacity-40 group-hover:opacity-70 transition-opacity duration-300"
                  style={{
                    background: 'linear-gradient(135deg, #ECC25E, transparent 60%)',
                  }}
                />
                <div className="relative rounded-2xl bg-[#111113]/95 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, #ECC25E20, #ECC25E10)',
                        boxShadow: '0 0 20px rgba(236,194,94,0.1)',
                      }}
                    >
                      <TrendingUp size={14} style={{ color: '#ECC25E' }} />
                    </div>
                    <span
                      className="text-sm font-bold tracking-tight"
                      style={{
                        background: 'linear-gradient(135deg, #ECC25E, #F5D97E)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      Believers
                    </span>
                  </div>
                  <p className="text-xs text-[#777] leading-relaxed">
                    Stake 20% on a token you believe in. A Backer funds the rest.
                    First-loss risk, amplified upside.
                  </p>
                  {/* Profit split bar */}
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-[#555]">Profit split</span>
                      <span className="text-xs font-bold" style={{ color: '#ECC25E' }}>60%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: 'linear-gradient(90deg, #ECC25E, #F5D97E)',
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: '60%' }}
                        transition={{ duration: 1, delay: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Backer card */}
              <div className="group relative flex-1 rounded-2xl p-[1px] transition-all duration-300 hover:scale-[1.02]">
                <div
                  className="absolute inset-0 rounded-2xl opacity-40 group-hover:opacity-70 transition-opacity duration-300"
                  style={{
                    background: 'linear-gradient(135deg, #61A6FB, transparent 60%)',
                  }}
                />
                <div className="relative rounded-2xl bg-[#111113]/95 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, #61A6FB20, #61A6FB10)',
                        boxShadow: '0 0 20px rgba(97,166,251,0.1)',
                      }}
                    >
                      <Shield size={14} style={{ color: '#61A6FB' }} />
                    </div>
                    <span
                      className="text-sm font-bold tracking-tight"
                      style={{
                        background: 'linear-gradient(135deg, #61A6FB, #8BC1FF)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      Backers
                    </span>
                  </div>
                  <p className="text-xs text-[#777] leading-relaxed">
                    Fund 80% of a Believer&apos;s trade. Your downside is shielded — their 20%
                    absorbs losses first.
                  </p>
                  {/* Profit split bar */}
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-[#555]">Profit split</span>
                      <span className="text-xs font-bold" style={{ color: '#61A6FB' }}>40%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: 'linear-gradient(90deg, #61A6FB, #8BC1FF)',
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: '40%' }}
                        transition={{ duration: 1, delay: 1, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Token Slot Machine */}
          {logos.length > 0 && (
            <motion.div
              className="flex-shrink-0 w-full lg:w-auto"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
            >
              <TokenSlotMachine logos={logos} />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
