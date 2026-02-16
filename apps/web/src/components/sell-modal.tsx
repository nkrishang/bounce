'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Loader2, TrendingDown, Check, XCircle } from 'lucide-react';
import { type TradeView, type TokenMeta, formatAddress } from '@thesis/shared';
import { formatUnits } from 'viem';
import { useSellTrade } from '@/hooks/use-sell-trade';
import { parseTransactionError } from '@/lib/parse-transaction-error';

interface SellModalProps {
  trade: TradeView;
  buyTokenMeta?: TokenMeta | null;
  open: boolean;
  onClose: () => void;
}

export function SellModal({ trade, buyTokenMeta, open, onClose }: SellModalProps) {
  const { sellTrade, reset, isLoading, step } = useSellTrade();
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setSubmitError(null);
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [open]);

  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => {
        onClose();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [step, onClose]);

  const totalPosition = formatUnits(BigInt(trade.data.sellAmount) * 5n, 6);
  const buyTokenAmount = formatUnits(
    BigInt(trade.state.buyTokenAmount || '0'),
    buyTokenMeta?.decimals || 18
  );

  const handleSell = async () => {
    setSubmitError(null);
    try {
      await sellTrade({
        chainId: trade.chainId,
        escrowAddress: trade.escrow,
        buyToken: trade.data.buyToken,
        sellToken: trade.data.sellToken,
        buyTokenAmount: BigInt(trade.state.buyTokenAmount || '0'),
      });
    } catch (err) {
      console.error('Failed to sell trade:', err);
      setSubmitError(parseTransactionError(err));
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
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="bg-muted border border-border rounded-xl shadow-2xl overflow-hidden w-full max-w-md pointer-events-auto">
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

                <AnimatePresence mode="wait">
                  {submitError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-4 rounded-lg bg-danger/10 border border-danger/20"
                    >
                      <div className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-danger">{submitError.title}</p>
                          <p className="text-danger/80 mt-1">{submitError.message}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onClose}
                    disabled={isLoading || step === 'success'}
                    className="py-3 rounded-lg border border-border font-medium hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={!isLoading && step !== 'success' ? { scale: 1.02 } : {}}
                    whileTap={!isLoading && step !== 'success' ? { scale: 0.98 } : {}}
                    animate={
                      submitError
                        ? {
                            x: [0, -8, 8, -8, 8, -4, 4, 0],
                            transition: { duration: 0.5 },
                          }
                        : step === 'success'
                        ? {
                            scale: [1, 1.02, 1],
                            transition: { duration: 0.3 },
                          }
                        : {}
                    }
                    onClick={handleSell}
                    disabled={isLoading || step === 'success'}
                    className={`py-3 rounded-lg font-medium disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors ${
                      step === 'success'
                        ? 'bg-green-600 text-white'
                        : submitError
                        ? 'bg-danger text-white'
                        : 'bg-warning text-black disabled:opacity-50'
                    }`}
                  >
                    {step === 'success' ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-2"
                      >
                        <Check className="w-5 h-5" />
                        Sold!
                      </motion.div>
                    ) : isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {step === 'fetching-quote' && 'Finding best route...'}
                        {step === 'sell' && 'Selling...'}
                        {step === 'confirming' && 'Confirming...'}
                      </>
                    ) : submitError ? (
                      <>
                        <XCircle className="w-5 h-5" />
                        Try Again
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
