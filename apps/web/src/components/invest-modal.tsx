'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Loader2, Check, User, Clock, TrendingUp, Shield, ExternalLink, XCircle } from 'lucide-react';
import { type TradeView, type TokenMeta, formatAddress, calculateFunderContribution } from '@thesis/shared';
import { EXPLORER_URLS } from '@thesis/contracts';
import { formatUnits } from 'viem';
import { useAuth } from '@/hooks/use-auth';
import { useFundTrade } from '@/hooks/use-fund-trade';
import { TokenAvatar } from './token-avatar';
import { CountdownTimer } from './countdown-timer';
import { LinkifyText } from './linkify-text';
import { parseTransactionError } from '@/lib/parse-transaction-error';

interface InvestModalProps {
  trade: TradeView;
  buyTokenMeta?: TokenMeta | null;
  open: boolean;
  onClose: () => void;
  previewMode?: boolean;
}

export function InvestModal({ trade, buyTokenMeta, open, onClose, previewMode = false }: InvestModalProps) {
  const router = useRouter();
  const { isAuthenticated, login, address } = useAuth();
  const { fundTrade, reset, isLoading, step } = useFundTrade();
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
    setSubmitError(null);

    try {
      await fundTrade({
        chainId: trade.chainId,
        escrowAddress: trade.escrow,
        funderContribution: BigInt(calculateFunderContribution(trade.data.sellAmount)),
        sellToken: trade.data.sellToken,
        buyToken: trade.data.buyToken,
      });
      router.push('/my-trades?tab=active');
    } catch (err) {
      console.error('Failed to fund trade:', err);
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-muted border border-border rounded-xl shadow-2xl overflow-hidden w-full max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain">
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
                  <TokenAvatar
                    src={buyTokenMeta?.logoUrl}
                    name={trade.data.buyToken}
                    alt={buyTokenMeta?.symbol}
                    size={48}
                    rounded="xl"
                  />
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
                    <p className="text-sm italic">
                      &ldquo;<LinkifyText text={thesis} />&rdquo;
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-background">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <User className="w-4 h-4" />
                      <span className="text-xs">Proposer</span>
                    </div>
                    <a
                      href={`${EXPLORER_URLS[trade.chainId]}/address/${trade.data.proposer}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-primary hover:underline transition-colors inline-flex items-center gap-1"
                    >
                      {formatAddress(trade.data.proposer)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
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

                {previewMode ? (
                  <div className="w-full py-4 rounded-lg bg-muted-foreground/20 text-muted-foreground font-medium text-center">
                    Preview Mode
                  </div>
                ) : !isAuthenticated ? (
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
                    whileHover={!isLoading && step !== 'success' ? { scale: 1.01 } : {}}
                    whileTap={!isLoading && step !== 'success' ? { scale: 0.99 } : {}}
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
                    onClick={handleInvest}
                    disabled={isLoading || step === 'success'}
                    className={`w-full py-4 rounded-lg font-medium disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors ${
                      step === 'success'
                        ? 'bg-green-600 text-white'
                        : submitError
                        ? 'bg-danger text-white'
                        : 'bg-primary text-primary-foreground disabled:opacity-50'
                    }`}
                  >
                    {step === 'success' ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-2"
                      >
                        <Check className="w-5 h-5" />
                        Trade Funded!
                      </motion.div>
                    ) : isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {step === 'approve' && 'Approving USDC...'}
                        {step === 'fetching-quote' && 'Finding best route...'}
                        {step === 'buy' && 'Executing Trade...'}
                        {step === 'confirming' && 'Confirming...'}
                      </>
                    ) : submitError ? (
                      <>
                        <XCircle className="w-5 h-5" />
                        Try Again
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
