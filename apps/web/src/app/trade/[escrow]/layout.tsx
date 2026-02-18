import type { Metadata } from 'next';
import { fetchTradeByEscrow } from './fetch-trade';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TradeLayoutProps {
  children: React.ReactNode;
  params: Promise<{ escrow: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ escrow: string }> }): Promise<Metadata> {
  const { escrow } = await params;

  try {
    const trade = await fetchTradeByEscrow(escrow);
    if (!trade) throw new Error('Trade not found');

    const tokenRes = await fetch(
      `${API_URL}/tokens/${trade.data.buyToken}?chainId=${trade.chainId}`,
      { next: { revalidate: 300 } }
    );
    const tokenMeta = tokenRes.ok ? (await tokenRes.json()).data : null;

    const tokenSymbol = tokenMeta?.symbol || 'Token';
    const tokenName = tokenMeta?.name || 'Unknown';
    const sellAmount = (Number(BigInt(trade.data.sellAmount)) / 1e6).toLocaleString();

    const title = `Buy ${tokenSymbol} with Loss Protection | BOUNCE.CAPITAL`;
    const description = `Back a ${tokenName} (${tokenSymbol}) trade with up to $${sellAmount} loss-protection guaranteed on BOUNCE.CAPITAL`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        siteName: 'BOUNCE.CAPITAL',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
    };
  } catch {
    return {
      title: 'Trade | BOUNCE.CAPITAL',
      description: 'View and back loss-protected trades on BOUNCE.CAPITAL',
    };
  }
}

export default function TradeLayout({ children }: TradeLayoutProps) {
  return <>{children}</>;
}
