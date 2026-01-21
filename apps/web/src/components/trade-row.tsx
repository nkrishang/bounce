'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Clock, Loader2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { type TradeView, formatAddress, calculateProfitLoss } from '@escape/shared';
import { formatUnits } from 'viem';
import { useTokenMeta } from '@/hooks/use-token';
import { useSellTrade } from '@/hooks/use-sell-trade';
import { useWithdraw } from '@/hooks/use-withdraw';
import { SellModal } from './sell-modal';
import { CountdownTimer } from './countdown-timer';

interface TradeRowProps {
  trade: TradeView;
  role: 'proposer' | 'funder';
}

export function TradeRow({ trade, role }: TradeRowProps) {
  const [showSellModal, setShowSellModal] = useState(false);
  const { data: buyTokenMeta } = useTokenMeta(trade.data.buyToken);
  const { withdrawProposer, withdrawFunder, isLoading: withdrawLoading } = useWithdraw();

  const sellAmount = formatUnits(BigInt(trade.data.sellAmount), 6);
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
    
    const pnl = calculateProfitLoss(
      trade.state.totalSellIn,
      trade.state.finalSellAmount
    );

    const myPayout = role === 'proposer' 
      ? trade.state.proposerPayout 
      : trade.state.funderPayout;

    const myContribution = role === 'proposer'
      ? trade.state.proposerContribution
      : trade.state.funderContribution;

    const myPnL = BigInt(myPayout) - BigInt(myContribution);
    const myPnLFormatted = formatUnits(myPnL < 0n ? -myPnL : myPnL, 6);

    return {
      isProfit: myPnL >= 0n,
      amount: myPnLFormatted,
    };
  };

  const pnl = getPnL();

  const canWithdraw = role === 'proposer' 
    ? trade.canWithdrawProposer 
    : trade.canWithdrawFunder;

  const handleWithdraw = async () => {
    if (role === 'proposer') {
      await withdrawProposer(trade.escrow);
    } else {
      await withdrawFunder(trade.escrow);
    }
  };

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.005 }}
        className="p-5 rounded-xl bg-muted border border-border hover:border-primary/30 transition-all"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">
                {buyTokenMeta?.symbol?.[0] || '?'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">
                  {buyTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
                </h3>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-muted-foreground">
                Position: ${parseFloat(totalPosition).toLocaleString()} USDC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {trade.status === 'OPEN' && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Expires in</p>
                <p className="text-sm font-mono">
                  <CountdownTimer expirationTimestamp={trade.data.expirationTimestamp} />
                </p>
              </div>
            )}

            {trade.status === 'FUNDED' && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Your Stake</p>
                <p className="text-sm font-mono">
                  ${parseFloat(role === 'proposer' ? sellAmount : formatUnits(BigInt(trade.data.sellAmount) * 4n, 6)).toLocaleString()}
                </p>
              </div>
            )}

            {pnl && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Your P&L</p>
                <p className={`text-sm font-mono flex items-center gap-1 ${pnl.isProfit ? 'text-success' : 'text-danger'}`}>
                  {pnl.isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {pnl.isProfit ? '+' : '-'}${parseFloat(pnl.amount).toLocaleString()}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {trade.canSell && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowSellModal(true)}
                  className="px-4 py-2 rounded-lg bg-warning text-black text-sm font-medium"
                >
                  Sell
                </motion.button>
              )}

              {canWithdraw && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleWithdraw}
                  disabled={withdrawLoading}
                  className="px-4 py-2 rounded-lg bg-success text-white text-sm font-medium disabled:opacity-50"
                >
                  {withdrawLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Withdraw'
                  )}
                </motion.button>
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
    </>
  );
}
