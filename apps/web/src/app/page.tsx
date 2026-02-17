'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { HeroSection } from '@/components/hero-section';
import { TradeProposalsCarousel } from '@/components/trade-proposals-carousel';
import { TrendingTokensTable } from '@/components/trending-tokens-table';
import { CreateTradeModal } from '@/components/create-trade-modal';
import type { TokenInfo } from '@/hooks/use-token-list';

export default function HomePage() {
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleBoostedBuy = (token: TokenInfo) => {
    setSelectedToken(token);
    setShowCreateModal(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <HeroSection />

      {/* Trade Proposals Section */}
      <section id="active-opportunities" className="py-6 scroll-mt-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <TradeProposalsCarousel />
        </div>
      </section>

      {/* Trending Tokens Section */}
      <section className="py-6">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <TrendingTokensTable onBoostedBuy={handleBoostedBuy} />
        </div>
      </section>

      {/* Boosted Buy Modal */}
      <CreateTradeModal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setSelectedToken(null);
        }}
        initialToken={selectedToken ? {
          address: selectedToken.address,
          name: selectedToken.name,
          symbol: selectedToken.symbol,
          logoURI: selectedToken.logoURI,
          networkId: selectedToken.networkId,
        } : null}
      />
    </div>
  );
}
