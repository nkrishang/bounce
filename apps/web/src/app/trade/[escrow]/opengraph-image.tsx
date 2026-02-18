import { ImageResponse } from 'next/og';
import { formatUnits } from 'viem';
import { calculateFunderContribution } from '@bounce/shared';
import { fetchTradeByEscrow } from './fetch-trade';

export const alt = 'BOUNCE.CAPITAL Trade';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
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
      sellAmount = parseFloat(formatUnits(BigInt(trade.data.sellAmount), 6));
      fundingNeeded = parseFloat(formatUnits(BigInt(calculateFunderContribution(trade.data.sellAmount)), 6));

      const tokenRes = await fetch(`${API_URL}/tokens/${trade.data.buyToken}?chainId=${trade.chainId}`);
      if (tokenRes.ok) {
        const { data: tokenMeta } = await tokenRes.json();
        tokenSymbol = tokenMeta.symbol || '???';
        tokenName = tokenMeta.name || 'Unknown Token';
        tokenLogoUrl = tokenMeta.logoUrl || null;
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
          background: '#0A0A0C',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow - top right */}
        <div style={{
          position: 'absolute',
          top: -120,
          right: -120,
          width: 500,
          height: 500,
          borderRadius: 999,
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
          display: 'flex',
        }} />
        {/* Background glow - bottom left */}
        <div style={{
          position: 'absolute',
          bottom: -160,
          left: -80,
          width: 450,
          height: 450,
          borderRadius: 999,
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.1) 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* Subtle grid lines */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        {/* Main content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 64px',
          height: '100%',
          position: 'relative',
        }}>

          {/* Top row: logo + badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${APP_URL}/logos/bounce-cap.png`} width={28} height={28} alt="" />
              <span style={{ color: '#a1a1aa', fontSize: 18, fontWeight: 600, letterSpacing: '0.08em' }}>BOUNCE.CAPITAL</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              borderRadius: 999,
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: '#22c55e', display: 'flex' }} />
              <span style={{ color: '#22c55e', fontSize: 14, fontWeight: 600, letterSpacing: '0.04em' }}>LOSS PROTECTED</span>
            </div>
          </div>

          {/* Center content */}
          <div style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            gap: 56,
            marginTop: 8,
          }}>

            {/* Left: Token identity */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                {/* Token logo with glow ring */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 96,
                  height: 96,
                  borderRadius: 24,
                  background: 'rgba(255,255,255,0.05)',
                  border: '2px solid rgba(255,255,255,0.1)',
                  position: 'relative',
                }}>
                  {tokenLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tokenLogoUrl}
                      width={72}
                      height={72}
                      alt=""
                      style={{ borderRadius: 16 }}
                    />
                  ) : (
                    <div style={{
                      width: 72, height: 72, borderRadius: 16,
                      background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontSize: 32, fontWeight: 700,
                    }}>
                      {tokenSymbol[0]}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{
                    color: '#fafafa',
                    fontSize: 52,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}>
                    {tokenName}
                  </span>
                  <span style={{
                    color: '#71717a',
                    fontSize: 24,
                    fontWeight: 500,
                    marginTop: 6,
                  }}>
                    ${tokenSymbol}
                  </span>
                </div>
              </div>

              {/* CTA */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: 4,
              }}>
                <span style={{
                  color: '#D4AD4A',
                  fontSize: 22,
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}>
                  Buy with up to 20% loss-protection guaranteed →
                </span>
              </div>
            </div>

            {/* Right: Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 280 }}>
              {/* Protection card */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '28px 32px',
                borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.04) 100%)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
              }}>
                <span style={{
                  color: '#22c55e',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase' as const,
                  marginBottom: 8,
                }}>
                  PROTECTION
                </span>
                <span style={{
                  color: '#fafafa',
                  fontSize: 44,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}>
                  ${sellAmount.toLocaleString()}
                </span>
                <span style={{
                  color: '#71717a',
                  fontSize: 14,
                  marginTop: 6,
                }}>
                  USDC guaranteed
                </span>
              </div>

              {/* Funding card */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '28px 32px',
                borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(97, 166, 251, 0.12) 0%, rgba(97, 166, 251, 0.04) 100%)',
                border: '1px solid rgba(97, 166, 251, 0.25)',
              }}>
                <span style={{
                  color: '#61A6FB',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase' as const,
                  marginBottom: 8,
                }}>
                  FUNDING ASKED
                </span>
                <span style={{
                  color: '#fafafa',
                  fontSize: 44,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}>
                  ${fundingNeeded.toLocaleString()}
                </span>
                <span style={{
                  color: '#71717a',
                  fontSize: 14,
                  marginTop: 6,
                }}>
                  USDC to fund
                </span>
              </div>
            </div>
          </div>

          {/* Bottom accent line */}
          <div style={{
            display: 'flex',
            width: '100%',
            height: 3,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #22c55e, #61A6FB, #D4AD4A)',
            opacity: 0.6,
            marginTop: 8,
          }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
