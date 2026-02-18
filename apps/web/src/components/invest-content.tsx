'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Loader2, Check, Clock, TrendingUp, Shield, ExternalLink, XCircle, Wallet } from 'lucide-react';
import { type TradeView, type TokenMeta, formatAddress, calculateFunderContribution } from '@bounce/shared';
import { EXPLORER_URLS } from '@bounce/contracts';
import { formatUnits } from 'viem';
import { useAuth } from '@/hooks/use-auth';
import { useFundTrade } from '@/hooks/use-fund-trade';
import { useWalletBalances } from '@/hooks/use-wallet';
import { TokenAvatar } from './token-avatar';
import { CountdownTimer } from './countdown-timer';
import { LinkifyText } from './linkify-text';
import { parseTransactionError } from '@/lib/parse-transaction-error';

interface InvestContentProps {
  trade: TradeView;
  buyTokenMeta?: TokenMeta | null;
  previewMode?: boolean;
  onExpire?: () => void;
  onFundSuccess?: () => void;
}

export function InvestContent({ trade, buyTokenMeta, previewMode = false, onExpire, onFundSuccess }: InvestContentProps) {
  const router = useRouter();
  const { isAuthenticated, login, address } = useAuth();
  const { fundTrade, isLoading, step } = useFundTrade();
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const { data: balances, isLoading: balanceLoading } = useWalletBalances(address);
  const balanceRaw = balances?.[trade.chainId] ?? '0';
  const usdcBalance = balanceRaw && balanceRaw !== '0'
    ? parseFloat(formatUnits(BigInt(balanceRaw), 6))
    : 0;

  const sellAmount = formatUnits(BigInt(trade.data.sellAmount), 6);
  const fundingNeeded = formatUnits(
    BigInt(calculateFunderContribution(trade.data.sellAmount)),
    6
  );
  const totalPosition = formatUnits(BigInt(trade.data.sellAmount) * 5n, 6);
  const exceedsBalance = !!address && !balanceLoading && parseFloat(fundingNeeded) > usdcBalance;

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
      if (onFundSuccess) {
        onFundSuccess();
      } else {
        router.push('/my-trades?tab=active');
      }
    } catch (err) {
      console.error('Failed to fund trade:', err);
      setSubmitError(parseTransactionError(err));
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Token header */}
      <div className="flex items-center gap-4">
        <div className="rounded-xl bg-[#1e1e22] border border-[#2a2a2e]/50 p-1.5">
          <TokenAvatar
            src={buyTokenMeta?.logoUrl}
            name={trade.data.buyToken}
            alt={buyTokenMeta?.symbol}
            size={44}
            rounded="lg"
          />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">
            {buyTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
          </h3>
          <p className="text-sm text-muted-foreground">{buyTokenMeta?.name}</p>
        </div>
      </div>

      {/* Thesis */}
      {thesis && (
        <div className="p-4 rounded-xl bg-[#111113] border border-dark-border">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Believer&apos;s Thesis</p>
          <p className="text-sm text-[#ccc] italic leading-relaxed">
            &ldquo;<LinkifyText text={thesis} />&rdquo;
          </p>
        </div>
      )}

      {/* Believer + Expiry row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-[#111113] border border-dark-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
            <div
              className="w-5 h-5 rounded flex items-center justify-center"
              style={{ background: 'rgba(236, 194, 94, 0.12)' }}
            >
              <TrendingUp size={11} style={{ color: '#D4AD4A' }} />
            </div>
            <span className="text-[11px] font-medium">Believer</span>
          </div>
          <a
            href={`${EXPLORER_URLS[trade.chainId]}/address/${trade.data.proposer}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm hover:underline transition-colors inline-flex items-center gap-1"
            style={{ color: '#D4AD4A' }}
          >
            {`${trade.data.proposer.slice(0, 4)}...${trade.data.proposer.slice(-4)}`}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="p-4 rounded-xl bg-[#111113] border border-dark-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
            <Clock className="w-4 h-4" />
            <span className="text-[11px] font-medium">Expires In</span>
          </div>
          <p className="font-mono text-sm text-[#ccc]">
            <CountdownTimer
              expirationTimestamp={trade.data.expirationTimestamp}
              onExpire={onExpire}
            />
          </p>
        </div>
      </div>

      {/* Funding breakdown */}
      <div className="rounded-xl border border-dark-border overflow-hidden">
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Believer Stake (20%)</span>
            <span className="font-mono text-[#ccc]">${parseFloat(sellAmount).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Your Funding (80%)</span>
            <span className="font-mono font-semibold" style={{ color: '#61A6FB' }}>
              ${parseFloat(fundingNeeded).toLocaleString()}
            </span>
          </div>
          <div className="h-px bg-dark-border" />
          <div className="flex justify-between font-semibold">
            <span className="text-white">Total Position</span>
            <span className="font-mono text-white">${parseFloat(totalPosition).toLocaleString()}</span>
          </div>
        </div>
        <div className="px-4 py-3 bg-[#111113] flex justify-between items-center">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="w-3.5 h-3.5" />
            Your Balance
          </span>
          <span className={`font-mono text-xs ${exceedsBalance ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
            {balanceLoading
              ? 'Loading...'
              : `$${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
            }
          </span>
        </div>
      </div>

      {/* Outcome scenarios */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl bg-[#111113] border border-dark-border">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-sm font-semibold text-success">If Profit</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">You receive 40% of gains</p>
        </div>
        <div className="p-3.5 rounded-xl bg-[#111113] border border-dark-border">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4" style={{ color: '#61A6FB' }} />
            <span className="text-sm font-semibold" style={{ color: '#61A6FB' }}>If Loss</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">Believer absorbs first 20% of loss</p>
        </div>
      </div>

      {/* Warning */}
      <div className="p-3 rounded-xl bg-warning/5 border border-warning/15 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          This will execute a swap immediately. Slippage and price impact apply.
        </p>
      </div>

      {exceedsBalance && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-xs text-danger">
            Insufficient USDC balance. You need ${parseFloat(fundingNeeded).toLocaleString()} USDC but only have ${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC.
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {submitError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-xl bg-danger/10 border border-danger/20"
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

      {/* CTA */}
      {previewMode ? (
        <div className="w-full py-4 rounded-xl bg-white/5 text-muted-foreground font-medium text-center">
          Preview Mode
        </div>
      ) : !isAuthenticated ? (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={login}
          className="w-full py-4 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all duration-200"
          style={{
            background: 'rgba(97, 166, 251, 0.12)',
            border: '1px solid rgba(97, 166, 251, 0.3)',
            color: '#61A6FB',
          }}
        >
          Sign In to Fund
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
          disabled={isLoading || step === 'success' || exceedsBalance}
          className={`w-full py-4 rounded-xl font-bold text-[15px] disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-200 ${
            step === 'success'
              ? 'bg-success text-white'
              : submitError
              ? 'bg-danger text-white'
              : exceedsBalance
              ? 'bg-danger/50 text-white'
              : 'disabled:opacity-50'
          }`}
          style={
            step !== 'success' && !submitError && !exceedsBalance
              ? {
                  background: 'rgba(97, 166, 251, 0.12)',
                  border: '1px solid rgba(97, 166, 251, 0.3)',
                  color: '#61A6FB',
                }
              : undefined
          }
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
          ) : exceedsBalance ? (
            <>
              <AlertTriangle className="w-5 h-5" />
              Insufficient USDC Balance
            </>
          ) : (
            <>
              <Shield className="w-5 h-5" />
              Fund ${parseFloat(fundingNeeded).toLocaleString()}
            </>
          )}
        </motion.button>
      )}
    </div>
  );
}
