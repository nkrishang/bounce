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

  // Load Inter Black (900) and Bold (700) as TTF — Satori does NOT support WOFF2
  const interBlack = await fetch(
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuBWYMZg.ttf'
  ).then((res) => res.arrayBuffer());

  const interBold = await fetch(
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf'
  ).then((res) => res.arrayBuffer());

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
          background: '#08080A',
          fontFamily: 'Inter',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow - green, centered on left half */}
        <div style={{
          position: 'absolute',
          top: -60,
          left: 40,
          width: 520,
          height: 520,
          borderRadius: 999,
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.22) 0%, rgba(34, 197, 94, 0.06) 50%, transparent 70%)',
          display: 'flex',
        }} />
        {/* Background glow - purple accent */}
        <div style={{
          position: 'absolute',
          top: 20,
          left: 140,
          width: 340,
          height: 340,
          borderRadius: 999,
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.14) 0%, transparent 60%)',
          display: 'flex',
        }} />

        {/* ===== LEFT HALF: Token Identity ===== */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          width: '50%',
          padding: '44px 48px',
          position: 'relative',
        }}>
          {/* Branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${APP_URL}/logos/bounce-cap.png`} width={26} height={26} alt="" />
            <span style={{ color: '#a1a1aa', fontSize: 17, fontWeight: 700, letterSpacing: '0.06em' }}>BOUNCE.CAPITAL</span>
          </div>

          {/* Token logo + name centered vertically */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}>
            {/* Token logo with glow ring */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 140,
              height: 140,
              borderRadius: 999,
              border: '3px solid rgba(34, 197, 94, 0.5)',
              boxShadow: '0 0 50px rgba(34, 197, 94, 0.4), 0 0 100px rgba(34, 197, 94, 0.15)',
              marginBottom: 24,
            }}>
              {tokenLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tokenLogoUrl}
                  width={104}
                  height={104}
                  alt=""
                  style={{ borderRadius: 999 }}
                />
              ) : (
                <div style={{
                  width: 104, height: 104, borderRadius: 999,
                  background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 46, fontWeight: 900,
                }}>
                  {tokenSymbol[0]}
                </div>
              )}
            </div>

            {/* Token name */}
            <span style={{
              color: '#fafafa',
              fontSize: 50,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              textAlign: 'center',
            }}>
              {tokenName}
            </span>
            <span style={{
              color: '#71717a',
              fontSize: 24,
              fontWeight: 700,
              marginTop: 10,
              letterSpacing: '0.04em',
            }}>
              ${tokenSymbol}
            </span>
          </div>
        </div>

        {/* ===== RIGHT HALF: Deal Card ===== */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          width: '50%',
          padding: '36px 48px 36px 24px',
          justifyContent: 'center',
        }}>
          {/* Glass card container */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 28,
            border: '1.5px solid rgba(255, 255, 255, 0.15)',
            background: 'linear-gradient(160deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.01) 100%)',
            boxShadow: '0 8px 80px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.2), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 40px rgba(255,255,255,0.03)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Glass shine highlight - top edge */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 40,
              right: 40,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              display: 'flex',
            }} />

            {/* Top section: BUY amount */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '40px 40px 36px',
            }}>
              <span style={{
                color: '#9ca3af',
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: '0.15em',
                marginBottom: 2,
              }}>
                BUY
              </span>
              <span style={{
                color: '#fafafa',
                fontSize: 96,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: '-0.04em',
              }}>
                ${fundingNeeded.toLocaleString()}
              </span>
              <span style={{
                color: '#9ca3af',
                fontSize: 24,
                fontWeight: 900,
                marginTop: 4,
                letterSpacing: '0.06em',
              }}>
                OF ${tokenSymbol}
              </span>
            </div>

            {/* Divider - bright green gradient line with glow */}
            <div style={{
              display: 'flex',
              width: '100%',
              height: 3,
              background: 'linear-gradient(90deg, transparent 5%, #22c55e 30%, #4ade80 50%, #22c55e 70%, transparent 95%)',
              boxShadow: '0 0 20px rgba(34, 197, 94, 0.5), 0 0 40px rgba(34, 197, 94, 0.2)',
            }} />

            {/* Bottom section: Protection with strong green glow background */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '32px 40px 40px',
              background: 'linear-gradient(180deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.04) 60%, rgba(34, 197, 94, 0.02) 100%)',
              position: 'relative',
            }}>
              {/* Green glow behind this section */}
              <div style={{
                position: 'absolute',
                top: -20,
                left: '50%',
                marginLeft: -120,
                width: 240,
                height: 200,
                borderRadius: 999,
                background: 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%)',
                display: 'flex',
              }} />

              {/* Shield + amount row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginBottom: 8,
                position: 'relative',
              }}>
                {/* Shield icon - large, with glow */}
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 30px rgba(34, 197, 94, 0.6), 0 0 60px rgba(34, 197, 94, 0.25)',
                  border: '2px solid rgba(74, 222, 128, 0.5)',
                }}>
                  <span style={{
                    color: 'white',
                    fontSize: 30,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}>✓</span>
                </div>
                <span style={{
                  color: '#4ade80',
                  fontSize: 64,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                }}>
                  ${sellAmount.toLocaleString()}
                </span>
              </div>
              <span style={{
                color: '#22c55e',
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: '0.12em',
              }}>
                LOSS PROTECTION
              </span>
              <span style={{
                color: '#16a34a',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.1em',
                marginTop: 2,
              }}>
                GUARANTEED
              </span>
            </div>

            {/* Glass shine - left edge */}
            <div style={{
              position: 'absolute',
              top: 40,
              left: 0,
              bottom: 40,
              width: 1,
              background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.15), transparent)',
              display: 'flex',
            }} />
            {/* Glass shine - right edge */}
            <div style={{
              position: 'absolute',
              top: 40,
              right: 0,
              bottom: 40,
              width: 1,
              background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.1), transparent)',
              display: 'flex',
            }} />
          </div>
        </div>

        {/* Bottom accent line */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 30%, #2563eb 60%, #D4AD4A 100%)',
          display: 'flex',
        }} />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: interBlack, weight: 900 as const, style: 'normal' as const },
        { name: 'Inter', data: interBold, weight: 700 as const, style: 'normal' as const },
      ],
    }
  );
}
