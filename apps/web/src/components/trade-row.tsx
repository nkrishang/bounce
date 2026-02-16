'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Loader2, Eye, Wallet, CheckCircle, Coins, ExternalLink } from 'lucide-react';
import { useState, useMemo } from 'react';
import { type TradeView, type TokenMeta, formatAddress, calculateFunderContribution } from '@thesis/shared';
import { EXPLORER_URLS } from '@thesis/contracts';
import { formatUnits, type Address } from 'viem';
import { useTokenMeta } from '@/hooks/use-token';
import { useTokenList } from '@/hooks/use-token-list';
import { useWithdraw } from '@/hooks/use-withdraw';
import { usePositionValue } from '@/hooks/use-position-value';
import { SellModal } from './sell-modal';
import { CountdownTimer } from './countdown-timer';
import { InvestModal } from './invest-modal';

interface TradeRowProps {
  trade: TradeView;
  role: 'proposer' | 'funder';
}

export function TradeRow({ trade, role }: TradeRowProps) {
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
    trade.status === 'FUNDED' ? trade.escrow as Address : undefined,
    trade.status === 'FUNDED' ? trade.data.buyToken as Address : undefined,
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

  const sellAmount = formatUnits(BigInt(trade.data.sellAmount), 6);
  const fundingNeeded = formatUnits(
    BigInt(calculateFunderContribution(trade.data.sellAmount)),
    6
  );
  const totalPosition = formatUnits(BigInt(trade.data.sellAmount) * 5n, 6);

  const getStatusBadge = () => {
    switch (trade.status) {
      case 'OPEN':
        return (
          <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
            Awaiting Funding
          </span>
        );
      case 'FUNDED':
        return (
          <span className="px-2 py-1 rounded-full bg-success/10 text-success text-xs">
            Active
          </span>
        );
      case 'SOLD':
        return (
          <span className="px-2 py-1 rounded-full bg-muted-foreground/10 text-muted-foreground text-xs">
            Closed
          </span>
        );
      case 'EXPIRED_UNFUNDED':
        return (
          <span className="px-2 py-1 rounded-full bg-warning/10 text-warning text-xs">
            Expired
          </span>
        );
    }
  };

  const getPnL = () => {
    if (!trade.state.sellPerformed) return null;

    const totalSellIn = BigInt(trade.state.totalSellIn);
    const finalSellAmount = BigInt(trade.state.finalSellAmount);

    // Position P&L (overall trade performance)
    const positionPnl = finalSellAmount - totalSellIn;
    const positionPnlAbs = positionPnl < 0n ? -positionPnl : positionPnl;
    const positionPnlPercent = totalSellIn > 0n
      ? Number((positionPnlAbs * 10000n) / totalSellIn) / 100
      : 0;

    // My P&L (personal gain/loss)
    const myPayout = BigInt(role === 'proposer'
      ? trade.state.proposerPayout
      : trade.state.funderPayout);
    const myContribution = BigInt(role === 'proposer'
      ? trade.state.proposerContribution
      : trade.state.funderContribution);
    const myPnl = myPayout - myContribution;
    const myPnlAbs = myPnl < 0n ? -myPnl : myPnl;
    const myPnlPercent = myContribution > 0n
      ? Number((myPnlAbs * 10000n) / myContribution) / 100
      : 0;

    // Protection (loss absorbed by proposer's stake)
    const proposerContribution = BigInt(trade.state.proposerContribution);
    const proposerPayout = BigInt(trade.state.proposerPayout);
    const proposerLoss = proposerContribution - proposerPayout;
    const protection = proposerLoss > 0n ? proposerLoss : 0n;
    const protectionPercent = totalSellIn > 0n
      ? Number((protection * 10000n) / totalSellIn) / 100
      : 0;

    return {
      position: {
        isProfit: positionPnl >= 0n,
        amount: formatUnits(positionPnlAbs, 6),
        percent: positionPnlPercent,
      },
      personal: {
        isProfit: myPnl >= 0n,
        amount: formatUnits(myPnlAbs, 6),
        percent: myPnlPercent,
      },
      protection: {
        amount: formatUnits(protection, 6),
        percent: protectionPercent,
        hasProtection: protection > 0n,
      },
    };
  };

  const pnl = getPnL();

  const canWithdraw = role === 'proposer' 
    ? trade.canWithdrawProposer 
    : trade.canWithdrawFunder;

  const handleWithdraw = async () => {
    if (role === 'proposer') {
      await withdrawProposer(trade.chainId, trade.escrow);
    } else {
      await withdrawFunder(trade.chainId, trade.escrow);
    }
  };

  if (trade.status === 'FUNDED') {
    return (
      <>
        <motion.div
          whileHover={{ scale: 1.002 }}
          className="rounded-xl bg-muted overflow-hidden border border-border hover:border-primary/30 transition-all"
        >
          {/* Main Stats Row */}
          <div className="p-6">
            <div className="flex items-start justify-between gap-6">
              {/* Token Info */}
              <div className="flex items-center gap-4">
                {displayTokenMeta?.logoUrl ? (
                  <img
                    src={displayTokenMeta.logoUrl}
                    alt={displayTokenMeta.symbol}
                    className="w-14 h-14 rounded-xl"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">
                      {displayTokenMeta?.symbol?.[0] || '?'}
                    </span>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold">
                      {displayTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
                    </h3>
                    <span className="px-2.5 py-1 rounded-full bg-success/20 text-success text-xs font-semibold uppercase tracking-wide">
                      Active
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {displayTokenMeta?.name || 'Unknown Token'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                {trade.canSell && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowSellModal(true)}
                    className="px-6 py-2.5 rounded-xl bg-warning hover:bg-warning/90 text-black font-semibold text-sm transition-colors"
                  >
                    Sell Position
                  </motion.button>
                )}
                {canWithdraw && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleWithdraw}
                    disabled={withdrawLoading}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {withdrawLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Wallet className="w-4 h-4" />
                        Withdraw
                      </>
                    )}
                  </motion.button>
                )}
                {(role === 'proposer' ? trade.state.withdrawProposerPerformed : trade.state.withdrawFunderPerformed) && (
                  <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-success/10 text-success font-medium text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Withdrawn
                  </div>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              {/* Holdings */}
              <div className="bg-background/50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-1">Holdings</p>
                {positionLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Loading...</span>
                  </div>
                ) : positionValue?.tokenBalanceFormatted ? (
                  <p className="text-2xl font-bold font-mono flex items-center gap-2">
                    <Coins className="w-5 h-5 text-primary" />
                    {parseFloat(positionValue.tokenBalanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">--</p>
                )}
              </div>

              {/* Cost Basis */}
              <div className="bg-background/50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-1">Cost Basis</p>
                <p className="text-2xl font-bold font-mono">
                  ${parseFloat(formatUnits(BigInt(trade.state.totalSellIn), 6)).toLocaleString()}
                </p>
              </div>

              {/* Current Value */}
              <div className="bg-background/50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-1">Current Value</p>
                {positionLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Loading...</span>
                  </div>
                ) : positionValue?.currentValueUsdcFormatted ? (
                  <p className="text-2xl font-bold font-mono">
                    ${parseFloat(positionValue.currentValueUsdcFormatted).toLocaleString()}
                  </p>
                ) : positionValue?.noLiquidity ? (
                  <p className="text-sm font-medium text-warning">No liquidity</p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">--</p>
                )}
              </div>

              {/* P&L */}
              <div className={`rounded-xl p-4 ${
                positionValue?.isProfit === true 
                  ? 'bg-success/10' 
                  : positionValue?.isProfit === false 
                    ? 'bg-danger/10' 
                    : 'bg-background/50'
              }`}>
                <p className="text-sm text-muted-foreground mb-1">Unrealized P&L</p>
                {positionLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Loading...</span>
                  </div>
                ) : positionValue?.pnlUsdcFormatted && positionValue.pnlPercent !== null ? (
                  <div className={`flex items-center gap-2 ${positionValue.isProfit ? 'text-success' : 'text-danger'}`}>
                    {positionValue.isProfit ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                    <span className="text-2xl font-bold font-mono">
                      {positionValue.isProfit ? '+' : '-'}${positionValue.pnlUsdcFormatted}
                    </span>
                    <span className="text-sm font-semibold px-2 py-0.5 rounded-md bg-current/10">
                      {positionValue.isProfit ? '+' : ''}{positionValue.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                ) : positionValue?.noLiquidity ? (
                  <p className="text-sm font-medium text-warning">No liquidity</p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">--</p>
                )}
              </div>
            </div>
          </div>

          {/* Details Footer */}
          <div className="px-6 py-4 bg-background/30 border-t border-border/30">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Your {role === 'proposer' ? 'Stake' : 'Investment'}</span>
                <span className="font-mono font-semibold text-primary">
                  ${parseFloat(formatUnits(BigInt(role === 'proposer' ? trade.state.proposerContribution : trade.state.funderContribution), 6)).toLocaleString()}
                </span>
              </div>
              <div className="w-px h-4 bg-border/50" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{role === 'proposer' ? 'Funder' : 'Proposer'}</span>
                <span className="font-mono font-semibold">
                  ${parseFloat(formatUnits(BigInt(role === 'proposer' ? trade.state.funderContribution : trade.state.proposerContribution), 6)).toLocaleString()}
                </span>
              </div>
              <div className="w-px h-4 bg-border/50" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Token</span>
                <a
                  href={`${EXPLORER_URLS[trade.chainId]}/address/${trade.data.buyToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-muted-foreground/80 hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  {formatAddress(trade.data.buyToken)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="w-px h-4 bg-border/50" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Escrow</span>
                <a
                  href={`${EXPLORER_URLS[trade.chainId]}/address/${trade.escrow}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-muted-foreground/80 hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  {formatAddress(trade.escrow)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </motion.div>

        <SellModal
          trade={trade}
          buyTokenMeta={buyTokenMeta}
          open={showSellModal}
          onClose={() => setShowSellModal(false)}
        />
      </>
    );
  }

  // Non-funded trades (OPEN, SOLD, EXPIRED_UNFUNDED)
  return (
    <>
      <motion.div
        whileHover={{ scale: 1.005 }}
        className="p-5 rounded-xl bg-muted border border-border hover:border-primary/30 transition-all"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {displayTokenMeta?.logoUrl ? (
              <img
                src={displayTokenMeta.logoUrl}
                alt={displayTokenMeta.symbol}
                className="w-12 h-12 rounded-xl"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">
                  {displayTokenMeta?.symbol?.[0] || '?'}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">
                  {displayTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
                </h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-muted-foreground">
                {displayTokenMeta?.name || formatAddress(trade.data.buyToken)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:grid grid-cols-3 gap-6 text-sm">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {role === 'proposer' ? 'Your Stake (20%)' : 'Your Investment (80%)'}
                </p>
                <p className="font-mono font-medium">
                  ${parseFloat(role === 'proposer' ? sellAmount : fundingNeeded).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {role === 'proposer' ? 'Funding Needed' : 'Proposer Stake'}
                </p>
                <p className="font-mono font-medium text-primary">
                  ${parseFloat(role === 'proposer' ? fundingNeeded : sellAmount).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Position</p>
                <p className="font-mono font-medium">
                  ${parseFloat(totalPosition).toLocaleString()}
                </p>
              </div>
            </div>

            {trade.status === 'OPEN' && (
              <div className="text-right min-w-[80px]">
                <p className="text-xs text-muted-foreground">Expires in</p>
                <p className="text-sm font-mono">
                  <CountdownTimer expirationTimestamp={trade.data.expirationTimestamp} />
                </p>
              </div>
            )}

            {trade.status === 'EXPIRED_UNFUNDED' && (
              <div className="text-right min-w-[80px]">
                <p className="text-xs text-muted-foreground">Expired</p>
                <p className="text-sm font-mono text-danger">
                  {(() => {
                    const diff = Math.floor(Date.now() / 1000) - trade.data.expirationTimestamp;
                    if (diff < 60) return `${diff}s ago`;
                    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
                    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
                    return `${Math.round(diff / 86400)}d ago`;
                  })()}
                </p>
              </div>
            )}

            {pnl && (
              <>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Position P&L</p>
                  <p className={`text-sm font-mono flex items-center justify-end gap-1 ${pnl.position.isProfit ? 'text-success' : 'text-danger'}`}>
                    {pnl.position.isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {pnl.position.isProfit ? '+' : '-'}${parseFloat(pnl.position.amount).toLocaleString()}
                  </p>
                  <p className={`text-xs font-mono ${pnl.position.isProfit ? 'text-success/70' : 'text-danger/70'}`}>
                    {pnl.position.isProfit ? '+' : '-'}{pnl.position.percent.toFixed(2)}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Your P&L</p>
                  <p className={`text-sm font-mono flex items-center justify-end gap-1 ${pnl.personal.isProfit ? 'text-success' : 'text-danger'}`}>
                    {pnl.personal.isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {pnl.personal.isProfit ? '+' : '-'}${parseFloat(pnl.personal.amount).toLocaleString()}
                  </p>
                  <p className={`text-xs font-mono ${pnl.personal.isProfit ? 'text-success/70' : 'text-danger/70'}`}>
                    {pnl.personal.isProfit ? '+' : '-'}{pnl.personal.percent.toFixed(2)}%
                  </p>
                </div>
                {role === 'funder' && pnl.protection.hasProtection && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Protection</p>
                    <p className="text-sm font-mono text-primary flex items-center justify-end gap-1">
                      ${parseFloat(pnl.protection.amount).toLocaleString()}
                    </p>
                    <p className="text-xs font-mono text-primary/70">
                      {pnl.protection.percent.toFixed(2)}%
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              {trade.status === 'OPEN' && role === 'proposer' && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowPreviewModal(true)}
                  className="px-3 py-2 rounded-lg bg-muted-foreground/10 hover:bg-muted-foreground/20 text-sm font-medium flex items-center gap-1.5"
                  title="Preview how funders see this trade"
                >
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">Preview</span>
                </motion.button>
              )}

              {canWithdraw && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleWithdraw}
                  disabled={withdrawLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {withdrawLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" />
                      Withdraw
                    </>
                  )}
                </motion.button>
              )}

              {(role === 'proposer' ? trade.state.withdrawProposerPerformed : trade.state.withdrawFunderPerformed) && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted-foreground/10 text-muted-foreground text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Withdrawn
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

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
