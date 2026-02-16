'use client';

import { useState, useMemo } from 'react';
import { Loader2, Wallet, CheckCircle, Eye } from 'lucide-react';
import { type TradeView, type TokenMeta, formatAddress, calculateFunderContribution } from '@thesis/shared';
import { formatUnits, type Address } from 'viem';
import { useTokenMeta } from '@/hooks/use-token';
import { useTokenList } from '@/hooks/use-token-list';
import { useWithdraw } from '@/hooks/use-withdraw';
import { usePositionValue } from '@/hooks/use-position-value';
import { computeActiveExpectedOutcomes, computeSoldMetrics } from '@/lib/trade-math';
import { SellModal } from './sell-modal';
import { InvestModal } from './invest-modal';
import { CountdownTimer } from './countdown-timer';

type Tab = 'proposed' | 'active' | 'sold';

interface MyTradeCardProps {
  trade: TradeView;
  role: 'proposer' | 'funder';
  tab: Tab;
}

export function MyTradeCard({ trade, role, tab }: MyTradeCardProps) {
  const [showSellModal, setShowSellModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const { data: buyTokenMeta } = useTokenMeta(trade.chainId, trade.data.buyToken);
  const { data: tokenList = [] } = useTokenList();
  const { withdrawProposer, withdrawFunder, isLoading: withdrawLoading } = useWithdraw();

  const tokenFromList = useMemo(() => {
    return tokenList.find(
      (t) => t.address.toLowerCase() === trade.data.buyToken.toLowerCase()
    );
  }, [tokenList, trade.data.buyToken]);

  const tokenDecimals = buyTokenMeta?.decimals ?? 18;

  const { data: positionValue, isLoading: positionLoading } = usePositionValue(
    trade.chainId,
    trade.status === 'FUNDED' ? (trade.escrow as Address) : undefined,
    trade.status === 'FUNDED' ? (trade.data.buyToken as Address) : undefined,
    tokenDecimals,
    trade.status === 'FUNDED' ? trade.state.totalSellIn : undefined
  );

  const displayTokenMeta = useMemo((): TokenMeta | null => {
    if (tokenFromList) {
      return {
        address: tokenFromList.address,
        symbol: tokenFromList.symbol,
        name: tokenFromList.name,
        decimals: buyTokenMeta?.decimals ?? 18,
        logoUrl: tokenFromList.logoURI,
      };
    }
    return buyTokenMeta ?? null;
  }, [tokenFromList, buyTokenMeta]);

  const logoUrl = tokenFromList?.logoURI ?? tokenFromList?.imageThumbUrl ?? displayTokenMeta?.logoUrl;

  const canWithdraw = role === 'proposer'
    ? trade.canWithdrawProposer
    : trade.canWithdrawFunder;

  const alreadyWithdrawn = role === 'proposer'
    ? trade.state.withdrawProposerPerformed
    : trade.state.withdrawFunderPerformed;

  const handleWithdraw = async () => {
    if (role === 'proposer') {
      await withdrawProposer(trade.chainId, trade.escrow);
    } else {
      await withdrawFunder(trade.chainId, trade.escrow);
    }
  };

  const expectedOutcomes = useMemo(() => {
    if (tab !== 'active' || !positionValue?.currentValueUsdc) return null;
    return computeActiveExpectedOutcomes(trade, positionValue.currentValueUsdc);
  }, [tab, trade, positionValue?.currentValueUsdc]);

  const soldMetrics = useMemo(() => {
    if (tab !== 'sold') return null;
    return computeSoldMetrics(trade, role);
  }, [tab, trade, role]);

  const sellAmount = formatUnits(BigInt(trade.data.sellAmount), 6);
  const fundingNeeded = formatUnits(
    BigInt(calculateFunderContribution(trade.data.sellAmount)),
    6
  );

  return (
    <>
      <div className="w-full rounded-xl bg-dark-surface border border-dark-border p-5 flex flex-col gap-4">
        {/* Token header */}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={displayTokenMeta?.symbol}
              className="w-10 h-10 rounded-lg"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">
                {displayTokenMeta?.symbol?.[0] || '?'}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-dark-surface-foreground truncate">
              {displayTokenMeta?.name || 'Unknown'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {displayTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground text-xs capitalize">
            {role}
          </span>
        </div>

        {/* Info rows */}
        <div className="space-y-2 text-sm">
          {tab === 'proposed' && (
            <ProposedInfo
              trade={trade}
              role={role}
              sellAmount={sellAmount}
              fundingNeeded={fundingNeeded}
            />
          )}
          {tab === 'active' && (
            <ActiveInfo
              trade={trade}
              role={role}
              positionValue={positionValue}
              positionLoading={positionLoading}
              expectedOutcomes={expectedOutcomes}
              tokenSymbol={displayTokenMeta?.symbol}
            />
          )}
          {tab === 'sold' && soldMetrics && (
            <SoldInfo soldMetrics={soldMetrics} />
          )}
        </div>

        {/* Action button */}
        <div>
          {tab === 'proposed' && role === 'proposer' && trade.status === 'OPEN' && (
            <button
              onClick={() => setShowPreviewModal(true)}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          )}
          {tab === 'proposed' && trade.status === 'EXPIRED_UNFUNDED' && canWithdraw && (
            <WithdrawButton loading={withdrawLoading} onClick={handleWithdraw} />
          )}
          {tab === 'active' && (
            <div className="flex flex-col gap-2">
              {trade.canSell && (
                <button
                  onClick={() => setShowSellModal(true)}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  Sell
                </button>
              )}
              {canWithdraw && (
                <WithdrawButton loading={withdrawLoading} onClick={handleWithdraw} />
              )}
              {alreadyWithdrawn && <WithdrawnBadge />}
            </div>
          )}
          {tab === 'sold' && (
            <>
              {canWithdraw && (
                <WithdrawButton loading={withdrawLoading} onClick={handleWithdraw} />
              )}
              {alreadyWithdrawn && <WithdrawnBadge />}
            </>
          )}
        </div>
      </div>

      <SellModal
        trade={trade}
        buyTokenMeta={buyTokenMeta}
        open={showSellModal}
        onClose={() => setShowSellModal(false)}
      />

      <InvestModal
        trade={trade}
        buyTokenMeta={displayTokenMeta}
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        previewMode
      />
    </>
  );
}

function InfoRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-medium ${className ?? ''}`}>{value}</span>
    </div>
  );
}

function ProposedInfo({
  trade,
  role,
  sellAmount,
  fundingNeeded,
}: {
  trade: TradeView;
  role: 'proposer' | 'funder';
  sellAmount: string;
  fundingNeeded: string;
}) {
  return (
    <>
      <InfoRow
        label={role === 'proposer' ? 'Your Stake (20%)' : 'Your Investment (80%)'}
        value={`$${parseFloat(role === 'proposer' ? sellAmount : fundingNeeded).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
        className="text-success"
      />
      <InfoRow
        label={role === 'proposer' ? 'Funding Needed (80%)' : 'Proposer Stake (20%)'}
        value={`$${parseFloat(role === 'proposer' ? fundingNeeded : sellAmount).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
        className="text-success"
      />
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">
          {trade.status === 'EXPIRED_UNFUNDED' ? 'Expired' : 'Expires in'}
        </span>
        <span className="font-mono text-dark-surface-foreground">
          {trade.status === 'EXPIRED_UNFUNDED' ? (
            <ExpiredAgo expirationTimestamp={trade.data.expirationTimestamp} />
          ) : (
            <CountdownTimer expirationTimestamp={trade.data.expirationTimestamp} />
          )}
        </span>
      </div>
    </>
  );
}

function ActiveInfo({
  trade,
  role,
  positionValue,
  positionLoading,
  expectedOutcomes,
  tokenSymbol,
}: {
  trade: TradeView;
  role: 'proposer' | 'funder';
  positionValue: ReturnType<typeof usePositionValue>['data'];
  positionLoading: boolean;
  expectedOutcomes: ReturnType<typeof computeActiveExpectedOutcomes>;
  tokenSymbol?: string;
}) {
  const myContribution = formatUnits(
    BigInt(role === 'proposer' ? trade.state.proposerContribution : trade.state.funderContribution),
    6
  );

  return (
    <>
      {/* Your Investment */}
      <InfoRow
        label="Your Investment"
        value={`$${parseFloat(myContribution).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
        className="text-dark-surface-foreground"
      />

      {/* Holdings */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Holdings</span>
        <span className="font-mono font-medium text-dark-surface-foreground">
          {positionLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground inline" />
          ) : positionValue?.tokenBalanceFormatted ? (
            `${parseFloat(positionValue.tokenBalanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${tokenSymbol ?? ''}`
          ) : (
            '--'
          )}
        </span>
      </div>

      {/* Cost Basis */}
      <InfoRow
        label="Cost Basis"
        value={`$${parseFloat(formatUnits(BigInt(trade.state.totalSellIn), 6)).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
        className="text-dark-surface-foreground"
      />

      {/* Current Value */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Current Value</span>
        <span className="font-mono font-medium text-dark-surface-foreground">
          {positionLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground inline" />
          ) : positionValue?.currentValueUsdcFormatted ? (
            `$${parseFloat(positionValue.currentValueUsdcFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })}`
          ) : positionValue?.noLiquidity ? (
            <span className="text-warning">No liquidity</span>
          ) : (
            '--'
          )}
        </span>
      </div>

      {/* Unrealized P&L */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Unrealized P&L</span>
        <span className="font-mono font-medium">
          {positionLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground inline" />
          ) : positionValue?.pnlUsdcFormatted && positionValue.pnlPercent !== null ? (
            <span className={positionValue.pnlPercent === 0 ? 'text-muted-foreground' : positionValue.isProfit ? 'text-success' : 'text-danger'}>
              {positionValue.isProfit ? '+' : '-'}${parseFloat(positionValue.pnlUsdcFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })} ({positionValue.isProfit ? '+' : ''}{positionValue.pnlPercent.toFixed(2)}%)
            </span>
          ) : (
            '--'
          )}
        </span>
      </div>

      {/* Expected P&L */}
      {expectedOutcomes && (() => {
        const myPayout = parseFloat(role === 'proposer' ? expectedOutcomes.proposerExpectedPayout : expectedOutcomes.funderExpectedPayout);
        const myContribNum = parseFloat(myContribution);
        const expectedPnl = myPayout - myContribNum;
        const isProfit = expectedPnl >= 0;
        const pnlAbs = Math.abs(expectedPnl);
        const pnlPercent = myContribNum > 0 ? (expectedPnl / myContribNum) * 100 : 0;
        const isZero = pnlAbs === 0;
        return (
          <InfoRow
            label="Expected P&L"
            value={`${isProfit ? '+' : '-'}$${pnlAbs.toLocaleString(undefined, { maximumFractionDigits: 4 })} (${isProfit ? '+' : ''}${pnlPercent.toFixed(2)}%)`}
            className={isZero ? 'text-muted-foreground' : isProfit ? 'text-success' : 'text-danger'}
          />
        );
      })()}

      {/* Expected Protection (funder) / Expected Bonus (proposer) */}
      {expectedOutcomes && role === 'funder' && (
        <InfoRow
          label="Expected Protection"
          value={expectedOutcomes.isProfit
            ? 'N/A in profit'
            : `$${parseFloat(expectedOutcomes.funderProtection).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
          className={expectedOutcomes.isProfit ? 'text-muted-foreground' : 'text-primary'}
        />
      )}
      {expectedOutcomes && role === 'proposer' && (
        <InfoRow
          label="Expected Bonus"
          value={expectedOutcomes.isProfit
            ? `+$${parseFloat(expectedOutcomes.proposerBonus).toLocaleString(undefined, { maximumFractionDigits: 4 })}`
            : 'N/A in loss'}
          className={expectedOutcomes.isProfit ? 'text-success' : 'text-muted-foreground'}
        />
      )}
    </>
  );
}

function SoldInfo({ soldMetrics }: { soldMetrics: NonNullable<ReturnType<typeof computeSoldMetrics>> }) {
  return (
    <>
      <InfoRow
        label="Your Investment"
        value={`$${parseFloat(soldMetrics.yourInvestment).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
        className="text-dark-surface-foreground"
      />
      <InfoRow
        label="Cost Basis"
        value={`$${parseFloat(soldMetrics.costBasis).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
        className="text-dark-surface-foreground"
      />
      <InfoRow
        label="Return Value"
        value={`$${parseFloat(soldMetrics.returnValue).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
        className="text-dark-surface-foreground"
      />
      <InfoRow
        label="Position P&L"
        value={`${soldMetrics.positionPnl.isProfit ? '+' : '-'}$${parseFloat(soldMetrics.positionPnl.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} (${soldMetrics.positionPnl.isProfit ? '+' : ''}${soldMetrics.positionPnl.percent.toFixed(2)}%)`}
        className={soldMetrics.positionPnl.percent === 0 ? 'text-muted-foreground' : soldMetrics.positionPnl.isProfit ? 'text-success' : 'text-danger'}
      />
      <InfoRow
        label="Your P&L"
        value={`${soldMetrics.yourPnl.isProfit ? '+' : '-'}$${parseFloat(soldMetrics.yourPnl.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} (${soldMetrics.yourPnl.isProfit ? '+' : ''}${soldMetrics.yourPnl.percent.toFixed(2)}%)`}
        className={soldMetrics.yourPnl.percent === 0 ? 'text-muted-foreground' : soldMetrics.yourPnl.isProfit ? 'text-success' : 'text-danger'}
      />
      {soldMetrics.role === 'proposer' && soldMetrics.positionPnl.isProfit ? (
        <InfoRow
          label="Bonus"
          value={`+$${parseFloat(soldMetrics.bonus).toLocaleString(undefined, { maximumFractionDigits: 4 })} (${soldMetrics.bonusPercent.toFixed(2)}%)`}
          className="text-success"
        />
      ) : (
        <InfoRow
          label="Protection"
          value={`$${parseFloat(soldMetrics.protection).toLocaleString(undefined, { maximumFractionDigits: 4 })} (${soldMetrics.protectionPercent.toFixed(2)}%)`}
          className="text-primary"
        />
      )}
    </>
  );
}

function WithdrawButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <Wallet className="w-4 h-4" />
          Withdraw
        </>
      )}
    </button>
  );
}

function WithdrawnBadge() {
  return (
    <div className="w-full py-2.5 rounded-lg bg-success/10 text-success font-medium text-sm inline-flex items-center justify-center gap-2">
      <CheckCircle className="w-4 h-4" />
      Withdrawn
    </div>
  );
}

function ExpiredAgo({ expirationTimestamp }: { expirationTimestamp: number }) {
  const diff = Math.floor(Date.now() / 1000) - expirationTimestamp;
  let text: string;
  if (diff < 60) text = `${diff}s ago`;
  else if (diff < 3600) text = `${Math.round(diff / 60)}m ago`;
  else if (diff < 86400) text = `${Math.round(diff / 3600)}h ago`;
  else text = `${Math.round(diff / 86400)}d ago`;
  return <span className="text-danger">{text}</span>;
}
