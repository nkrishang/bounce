'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Shield, BarChart3 } from 'lucide-react';
import type { PolymarketEvent, PolymarketMarket } from '@bounce/shared';
import { ProposalsCarousel } from '@/components/polymarket/proposals-carousel';
import { MarketGrid } from '@/components/polymarket/market-grid';
import { ProposeBetModal } from '@/components/polymarket/propose-bet-modal';

export default function PolymarketPage() {
  const [selectedEvent, setSelectedEvent] = useState<PolymarketEvent | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [selectedPrice, setSelectedPrice] = useState(0);
  const [showProposeModal, setShowProposeModal] = useState(false);

  const handlePropose = (
    event: PolymarketEvent,
    market: PolymarketMarket,
    tokenId: string,
    outcome: string,
    price: number
  ) => {
    setSelectedEvent(event);
    setSelectedMarket(market);
    setSelectedTokenId(tokenId);
    setSelectedOutcome(outcome);
    setSelectedPrice(price);
    setShowProposeModal(true);
  };

  const handleCloseModal = () => {
    setShowProposeModal(false);
    setSelectedEvent(null);
    setSelectedMarket(null);
    setSelectedTokenId('');
    setSelectedOutcome('');
    setSelectedPrice(0);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <section className="relative py-12 xl:py-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.06]"
            style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
          />
          <div
            className="absolute bottom-[-20%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-[0.04]"
            style={{ background: 'radial-gradient(circle, #61A6FB 0%, transparent 70%)' }}
          />
        </div>

        <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/20 bg-purple-500/[0.06] mb-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-medium tracking-wide text-purple-300 uppercase">
                Polymarket · Prediction Markets
              </span>
            </motion.div>

            <motion.h1
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <span className="text-white">Bet on </span>
              <span
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Real-World Events
              </span>
            </motion.h1>

            <motion.p
              className="mt-4 text-muted-foreground text-sm sm:text-base max-w-xl mx-auto"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Propose or fund Polymarket bets with the Bounce split.{' '}
              <span style={{ color: '#D4AD4A' }}>Believers</span> stake 20% and earn 60% of profits.{' '}
              <span style={{ color: '#61A6FB' }}>Backers</span> fund 80% with first-loss protection.
            </motion.p>

            {/* Role pills */}
            <motion.div
              className="mt-6 flex flex-wrap items-center justify-center gap-4"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <TrendingUp className="w-4 h-4" style={{ color: '#ECC25E' }} />
                <span className="text-sm font-medium" style={{ color: '#ECC25E' }}>Believer: 3x Profit</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <Shield className="w-4 h-4" style={{ color: '#61A6FB' }} />
                <span className="text-sm font-medium" style={{ color: '#61A6FB' }}>Backer: 20% Loss Protection</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Active Proposals */}
      <section className="py-6">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <ProposalsCarousel />
        </div>
      </section>

      {/* Browse Markets */}
      <section className="py-6 pb-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                High-Return Markets
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Select a Polymarket outcome to propose a leveraged bet.
            </p>
          </div>

          <MarketGrid onPropose={handlePropose} />
        </div>
      </section>

      {/* Propose Modal */}
      <ProposeBetModal
        open={showProposeModal}
        onClose={handleCloseModal}
        event={selectedEvent}
        market={selectedMarket}
        tokenId={selectedTokenId}
        outcome={selectedOutcome}
        price={selectedPrice}
      />
    </div>
  );
}
