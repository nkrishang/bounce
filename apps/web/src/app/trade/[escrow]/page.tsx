'use client';

import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { type TokenMeta } from '@bounce/shared';
import { useTrade } from '@/hooks/use-trades';
import { useTokenMeta } from '@/hooks/use-token';
import { useTokenList } from '@/hooks/use-token-list';
import { InvestContent } from '@/components/invest-content';

interface TradePageProps {
  params: Promise<{ escrow: string }>;
}

export default function TradePage({ params }: TradePageProps) {
  const { escrow } = use(params);
  const router = useRouter();
  const { data: trade, isLoading, error } = useTrade(escrow);
  const { data: buyTokenMeta } = useTokenMeta(
    trade?.chainId ?? 137,
    trade?.data.buyToken
  );
  const { data: tokenList = [] } = useTokenList();

  const tokenFromList = useMemo(() => {
    if (!trade) return null;
    return tokenList.find(
      (t) => t.address.toLowerCase() === trade.data.buyToken.toLowerCase()
    );
  }, [tokenList, trade]);

  const displayTokenMeta = useMemo((): TokenMeta | null => {
    if (tokenFromList) {
      return {
        address: tokenFromList.address,
        symbol: tokenFromList.symbol,
        name: tokenFromList.name,
        decimals: buyTokenMeta?.decimals ?? 18,
        logoUrl: tokenFromList.logoURI ?? tokenFromList.imageThumbUrl,
      };
    }
    return buyTokenMeta ?? null;
  }, [tokenFromList, buyTokenMeta]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading trade...</p>
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Trade not found</h2>
            <p className="text-sm text-muted-foreground">
              This trade may have been removed or the address is invalid.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-primary hover:underline transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="rounded-2xl bg-dark-surface border border-dark-border overflow-hidden">
          <InvestContent
            trade={trade}
            buyTokenMeta={displayTokenMeta}
            onFundSuccess={() => router.push('/my-trades?tab=active')}
          />
        </div>

        <Link
          href="/"
          className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          Explore trending tokens and loss-protected trades
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
