'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Loader2, Check, User, Clock, TrendingUp, Shield } from 'lucide-react';
import { type TradeView, type TokenMeta, formatAddress, calculateFunderContribution } from '@escape/shared';
import { formatUnits } from 'viem';
import { useAuth } from '@/hooks/use-auth';
import { useFundTrade } from '@/hooks/use-fund-trade';
import { CountdownTimer } from './countdown-timer';

interface InvestModalProps {
  trade: TradeView;
  buyTokenMeta?: TokenMeta | null;
  open: boolean;
  onClose: () => void;
}

export function InvestModal({ trade, buyTokenMeta, open, onClose }: InvestModalProps) {
  const { isAuthenticated, login, address } = useAuth();
  const { fundTrade, isLoading, step, error } = useFundTrade();

  const sellAmount = formatUnits(BigInt(trade.data.sellAmount), 6);
  const fundingNeeded = formatUnits(
    BigInt(calculateFunderContribution(trade.data.sellAmount)),
    6
  );
  const totalPosition = formatUnits(BigInt(trade.data.sellAmount) * 5n, 6);

  let thesis = '';
  try {
    const metadata = JSON.parse(trade.data.metadataUri);
    thesis = metadata.thesis || '';
  } catch {
    thesis = trade.data.metadataUri || '';
  }

  const handleInvest = async () => {
    if (!address) return;
    try {
      await fundTrade({
        escrowAddress: trade.escrow,
        funderContribution: BigInt(calculateFunderContribution(trade.data.sellAmount)),
        sellToken: trade.data.sellToken,
      });
      onClose();
    } catch (err) {
      console.error('Failed to fund trade:', err);
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 max-h-[90vh] overflow-y-auto"
          >
            <div className="bg-muted border border-border rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold">Invest in Trade</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-background transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">
                      {buyTokenMeta?.symbol?.[0] || '?'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">
                      {buyTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
                    </h3>
                    <p className="text-sm text-muted-foreground">{buyTokenMeta?.name}</p>
                  </div>
                </div>

                {thesis && (
                  <div className="p-4 rounded-lg bg-background border border-border">
                    <p className="text-sm text-muted-foreground mb-1">Proposer&apos;s Thesis</p>
                    <p className="text-sm italic">&ldquo;{thesis}&rdquo;</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-background">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <User className="w-4 h-4" />
                      <span className="text-xs">Proposer</span>
                    </div>
                    <p className="font-mono text-sm">{formatAddress(trade.data.proposer)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-background">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">Expires In</span>
                    </div>
                    <p className="font-mono text-sm">
                      <CountdownTimer
                        expirationTimestamp={trade.data.expirationTimestamp}
                        onExpire={onClose}
                      />
                    </p>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Proposer Stake (20%)</span>
                    <span className="font-mono">${parseFloat(sellAmount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Your Investment (80%)</span>
                    <span className="font-mono text-primary font-medium">
                      ${parseFloat(fundingNeeded).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between font-medium">
                    <span>Total Position</span>
                    <span className="font-mono">${parseFloat(totalPosition).toLocaleString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-success mt-0.5" />
                    <div>
                      <p className="font-medium">If Profit</p>
                      <p className="text-muted-foreground">You get 70% of gains</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">If Loss</p>
                      <p className="text-muted-foreground">Proposer absorbs first 20%</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    This will execute a swap immediately. Slippage and price impact may apply.
                  </p>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                    {error}
                  </div>
                )}

                {!isAuthenticated ? (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={login}
                    className="w-full py-4 rounded-lg bg-primary text-primary-foreground font-medium"
                  >
                    Sign In to Invest
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleInvest}
                    disabled={isLoading}
                    className="w-full py-4 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {step === 'approve' && 'Approving USDC...'}
                        {step === 'buy' && 'Executing Trade...'}
                        {step === 'confirming' && 'Confirming...'}
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        Invest ${parseFloat(fundingNeeded).toLocaleString()}
                      </>
                    )}
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
