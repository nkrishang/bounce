'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Loader2, TrendingDown } from 'lucide-react';
import { type TradeView, type TokenMeta, formatAddress } from '@escape/shared';
import { formatUnits } from 'viem';
import { useSellTrade } from '@/hooks/use-sell-trade';

interface SellModalProps {
  trade: TradeView;
  buyTokenMeta?: TokenMeta | null;
  open: boolean;
  onClose: () => void;
}

export function SellModal({ trade, buyTokenMeta, open, onClose }: SellModalProps) {
  const { sellTrade, isLoading, step, error } = useSellTrade();

  const totalPosition = formatUnits(BigInt(trade.data.sellAmount) * 5n, 6);
  const buyTokenAmount = formatUnits(
    BigInt(trade.state.buyTokenAmount || '0'),
    buyTokenMeta?.decimals || 18
  );

  const handleSell = async () => {
    try {
      await sellTrade({
        escrowAddress: trade.escrow,
        buyToken: trade.data.buyToken,
      });
      onClose();
    } catch (err) {
      console.error('Failed to sell trade:', err);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="bg-muted border border-border rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold">Sell Position</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-background transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-warning/20 to-danger/20 flex items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-warning" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">
                      Sell {buyTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
                    </h3>
                    <p className="text-sm text-muted-foreground">Back to USDC</p>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-background">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tokens to Sell</span>
                    <span className="font-mono">
                      {parseFloat(buyTokenAmount).toLocaleString()} {buyTokenMeta?.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Original Position</span>
                    <span className="font-mono">${parseFloat(totalPosition).toLocaleString()}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-warning mb-1">Important</p>
                    <p>
                      The final amount you receive may differ from estimates due to slippage and
                      price impact. After selling, both the proposer and funder can withdraw their
                      respective payouts.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onClose}
                    className="py-3 rounded-lg border border-border font-medium hover:bg-background transition-colors"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSell}
                    disabled={isLoading}
                    className="py-3 rounded-lg bg-warning text-black font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {step === 'approve' && 'Approving...'}
                        {step === 'sell' && 'Selling...'}
                        {step === 'confirming' && 'Confirming...'}
                      </>
                    ) : (
                      'Confirm Sell'
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
