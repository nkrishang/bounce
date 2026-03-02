'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import type { PolymarketEvent, PolymarketMarket } from '@bounce/shared';
import { HeroSection } from '@/components/polymarket/hero-section';
import { ProposalsCarousel } from '@/components/polymarket/proposals-carousel';
import { MarketGrid } from '@/components/polymarket/market-grid';
import { ProposeBetModal } from '@/components/polymarket/propose-bet-modal';
import { ProposalsDrawer } from '@/components/polymarket/proposals-drawer';

export default function PolymarketPage() {
  const [selectedEvent, setSelectedEvent] = useState<PolymarketEvent | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [selectedPrice, setSelectedPrice] = useState(0);
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState(0);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [showProposalsDrawer, setShowProposalsDrawer] = useState(false);
  const [drawerConditionId, setDrawerConditionId] = useState('');
  const [drawerMarketQuestion, setDrawerMarketQuestion] = useState('');

  const handleProtection = (conditionId: string, marketQuestion: string) => {
    setDrawerConditionId(conditionId);
    setDrawerMarketQuestion(marketQuestion);
    setShowProposalsDrawer(true);
  };

  const handlePropose = (
    event: PolymarketEvent,
    market: PolymarketMarket,
    tokenId: string,
    outcome: string,
    price: number,
    outcomeIndex: number
  ) => {
    setSelectedEvent(event);
    setSelectedMarket(market);
    setSelectedTokenId(tokenId);
    setSelectedOutcome(outcome);
    setSelectedPrice(price);
    setSelectedOutcomeIndex(outcomeIndex);
    setShowProposeModal(true);
  };

  const handleCloseModal = () => {
    setShowProposeModal(false);
    setSelectedEvent(null);
    setSelectedMarket(null);
    setSelectedTokenId('');
    setSelectedOutcome('');
    setSelectedPrice(0);
    setSelectedOutcomeIndex(0);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <HeroSection />

      {/* Active Proposals */}
      <section className="py-6">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <ProposalsCarousel />
        </div>
      </section>

      {/* Browse Markets */}
      <section id="markets" className="py-6 pb-20">
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

          <MarketGrid onPropose={handlePropose} onProtection={handleProtection} />
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
        outcomeIndex={selectedOutcomeIndex}
      />

      {/* Proposals Drawer */}
      <ProposalsDrawer
        open={showProposalsDrawer}
        onClose={() => setShowProposalsDrawer(false)}
        conditionId={drawerConditionId}
        marketQuestion={drawerMarketQuestion}
      />
    </div>
  );
}
