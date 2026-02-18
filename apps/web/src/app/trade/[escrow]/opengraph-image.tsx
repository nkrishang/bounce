import { ImageResponse } from 'next/og';
import { fetchTradeByEscrow } from './fetch-trade';

export const alt = 'BOUNCE.CAPITAL Trade';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bounce.capital';

export default async function OGImage({ params }: { params: Promise<{ escrow: string }> }) {
  const { escrow } = await params;

  let tokenSymbol = '???';
  let tokenName = 'Unknown Token';
  let tokenLogoUrl: string | null = null;
  let sellAmount = 0;
  let fundingNeeded = 0;

  try {
    const trade = await fetchTradeByEscrow(escrow);
    if (trade) {
      const sellAmountBig = BigInt(trade.data.sellAmount);
      sellAmount = Number(sellAmountBig) / 1e6;
      fundingNeeded = Number(sellAmountBig * 4n) / 1e6;

      // Fetch token meta and trending list in parallel for logo
      const [tokenRes, trendingRes] = await Promise.all([
        fetch(`${API_URL}/tokens/${trade.data.buyToken}?chainId=${trade.chainId}`),
        fetch(`${API_URL}/tokens/trending`),
      ]);

      if (tokenRes.ok) {
        const { data: tokenMeta } = await tokenRes.json();
        tokenSymbol = tokenMeta.symbol || '???';
        tokenName = tokenMeta.name || 'Unknown Token';
        tokenLogoUrl = tokenMeta.logoUrl || null;
      }

      // Get logo from trending list (same source the app UI uses)
      if (!tokenLogoUrl && trendingRes.ok) {
        const { data: trending } = await trendingRes.json();
        const match = trending.find(
          (t: { token: { address: string } }) =>
            t.token.address.toLowerCase() === trade.data.buyToken.toLowerCase()
        );
        if (match) {
          tokenLogoUrl =
            match.token.info?.imageSmallUrl ??
            match.token.info?.imageThumbUrl ??
            match.token.imageThumbUrl ??
            null;
          if (!tokenSymbol || tokenSymbol === '???') tokenSymbol = match.token.symbol;
          if (!tokenName || tokenName === 'Unknown Token') tokenName = match.token.name;
        }
      }
    }
  } catch {
    // Use defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#111113',
          fontFamily: 'sans-serif',
          padding: '60px',
        }}
      >
        {/* Top bar with logo */}
        <div style={{ position: 'absolute', top: 40, left: 60, display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${APP_URL}/logos/bounce-cap.png`} width={32} height={32} alt="" />
          <span style={{ color: '#fafafa', fontSize: 22, fontWeight: 700, letterSpacing: '0.02em' }}>BOUNCE.CAPITAL</span>
        </div>

        {/* Token info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 36 }}>
          {tokenLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tokenLogoUrl}
              width={80}
              height={80}
              alt=""
              style={{ borderRadius: 16 }}
            />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: 16,
              background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 36, fontWeight: 700,
            }}>
              {tokenSymbol[0]}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#fafafa', fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>{tokenName}</span>
            <span style={{ color: '#888888', fontSize: 24, marginTop: 4 }}>{tokenSymbol}</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 40, marginBottom: 44 }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '24px 48px', borderRadius: 16,
            border: '1px solid rgba(34, 197, 94, 0.35)',
            background: 'rgba(34, 197, 94, 0.08)',
          }}>
            <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>Protection</span>
            <span style={{ color: '#fafafa', fontSize: 38, fontWeight: 700, marginTop: 4 }}>
              ${sellAmount.toLocaleString()}
            </span>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '24px 48px', borderRadius: 16,
            border: '1px solid rgba(97, 166, 251, 0.3)',
            background: 'rgba(97, 166, 251, 0.08)',
          }}>
            <span style={{ color: '#61A6FB', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>Funding Asked</span>
            <span style={{ color: '#fafafa', fontSize: 38, fontWeight: 700, marginTop: 4 }}>
              ${fundingNeeded.toLocaleString()}
            </span>
          </div>
        </div>

        {/* CTA text */}
        <span style={{
          color: '#C8A93E', fontSize: 26, fontWeight: 600, textAlign: 'center',
        }}>
          Buy ${tokenSymbol} with up to 20% loss-protection guaranteed
        </span>
      </div>
    ),
    { ...size }
  );
}
