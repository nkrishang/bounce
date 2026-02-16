'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Clock, FileText, AlertCircle, Check, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCreateTrade } from '@/hooks/use-create-trade';
import { useWalletBalances } from '@/hooks/use-wallet';
import { parseUnits, formatUnits } from 'viem';
import { TokenSelector } from '@/components/token-selector';
import { ContributionInput } from '@/components/contribution-input';
import { TokenAvatar } from '@/components/token-avatar';
import { parseTransactionError } from '@/lib/parse-transaction-error';
import { TOKENS_BY_CHAIN, type SupportedChainId } from '@thesis/shared';
import type { TokenInfo } from '@/hooks/use-token-list';

const EXPIRATION_OPTIONS = [
  { label: '5 minutes', value: 5 * 60 },
  { label: '15 minutes', value: 15 * 60 },
  { label: '1 hour', value: 60 * 60 },
  { label: '6 hours', value: 6 * 60 * 60 },
  { label: '24 hours', value: 24 * 60 * 60 },
];

interface CreateTradeFormProps {
  initialToken?: {
    address: string;
    name: string;
    symbol: string;
    logoURI?: string;
    networkId?: number;
  } | null;
  onSuccess?: () => void;
  modal?: boolean;
}

export function CreateTradeForm({ initialToken, onSuccess, modal }: CreateTradeFormProps) {
  const router = useRouter();
  const { address } = useAuth();
  const { createTrade, isLoading, step, error } = useCreateTrade();

  const [chainId, setChainId] = useState<SupportedChainId>((initialToken?.networkId ?? 137) as SupportedChainId);
  const [buyToken, setBuyToken] = useState(initialToken?.address ?? '');
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(
    initialToken ? {
      address: initialToken.address as `0x${string}`,
      name: initialToken.name,
      symbol: initialToken.symbol,
      logoURI: initialToken.logoURI,
      networkId: initialToken.networkId ?? 137,
    } : null
  );
  const [sellAmount, setSellAmount] = useState('');
  const [expirationSeconds, setExpirationSeconds] = useState(EXPIRATION_OPTIONS[2].value);
  const [thesis, setThesis] = useState('');
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);

  const { data: balances, isLoading: balanceLoading } = useWalletBalances(address);
  const usdcBalanceRaw = balances?.[chainId] ?? '0';
  const usdcBalance = usdcBalanceRaw && usdcBalanceRaw !== '0'
    ? parseFloat(formatUnits(BigInt(usdcBalanceRaw), 6))
    : 0;
  const sellAmountNum = sellAmount ? parseFloat(sellAmount) : 0;
  const hasZeroUsdc = !!address && !balanceLoading && usdcBalance <= 0;
  const exceedsBalance = !!address && !balanceLoading && sellAmountNum > 0 && sellAmountNum > usdcBalance;
  const insufficientUsdc = hasZeroUsdc || exceedsBalance;

  const handleTokenChange = (tokenAddress: string, token?: TokenInfo) => {
    setBuyToken(tokenAddress);
    setSelectedToken(token ?? null);
    setChainId((token?.networkId ?? 137) as SupportedChainId);
  };

  const fundingNeeded = sellAmount ? (parseFloat(sellAmount) * 4).toFixed(2) : '0';
  const totalPosition = sellAmount ? (parseFloat(sellAmount) * 5).toFixed(2) : '0';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyToken || !sellAmount || !address) return;

    setSubmitError(null);

    try {
      await createTrade({
        chainId,
        buyToken: buyToken as `0x${string}`,
        sellAmount: parseUnits(sellAmount, 6),
        expirationSeconds,
        metadataUri: thesis ? JSON.stringify({ thesis }) : '',
      });
      router.push('/my-trades?tab=proposed');
    } catch (err) {
      console.error('Failed to create trade:', err);
      setSubmitError(parseTransactionError(err));
    }
  };

  const scrollableContent = (
    <>
      <div className={`${modal ? '' : 'p-6 rounded-xl bg-muted border border-border '}space-y-6`}>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Coins className="w-4 h-4 text-muted-foreground" />
            Token to Buy
          </label>
          <TokenSelector
            chainId={chainId}
            value={buyToken}
            onChange={handleTokenChange}
            usdcAddress={TOKENS_BY_CHAIN[chainId].USDC}
          />
          <p className="text-xs text-muted-foreground">
            Select from the list or add a custom token address
          </p>
        </div>

        <ContributionInput
          value={sellAmount}
          onChange={setSellAmount}
          address={address}
          chainId={chainId}
        />

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Expiration Time
          </label>
          <div className="grid grid-cols-3 gap-2">
            {EXPIRATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setExpirationSeconds(option.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  expirationSeconds === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background border border-border hover:border-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <FileText className="w-4 h-4 text-muted-foreground" />
            Thesis (Optional)
          </label>
          <p className="text-xs text-muted-foreground">
            Funders will see this thesis if they click on your proposed trade.
          </p>
          <textarea
            placeholder="Why is this a good trade?"
            value={thesis}
            onChange={(e) => {
              const sanitized = e.target.value
                .replace(/<[^>]*>/g, '')
                .replace(/[<>]/g, '');
              setThesis(sanitized.slice(0, 100));
            }}
            maxLength={100}
            rows={2}
            className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
          />
          <p className="text-xs text-muted-foreground text-right">
            {thesis.length}/100 characters
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="p-6 rounded-xl glass border border-border space-y-4"
      >
        <h3 className="font-medium">Trade Summary</h3>
        <div className="space-y-2 text-sm">
          {selectedToken && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Token</span>
              <div className="flex items-center gap-2">
                <TokenAvatar
                  src={selectedToken.logoURI}
                  name={selectedToken.address}
                  alt={selectedToken.symbol}
                  size={16}
                  rounded="full"
                />
                <span className="font-medium">{selectedToken.symbol}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your Stake (20%)</span>
            <span className="font-mono">{sellAmount || '0'} USDC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Funding Needed (80%)</span>
            <span className="font-mono">{fundingNeeded} USDC</span>
          </div>
          <div className="h-px bg-border my-2" />
          <div className="flex justify-between font-medium">
            <span>Total Position</span>
            <span className="font-mono">{totalPosition} USDC</span>
          </div>
        </div>
      </motion.div>
    </>
  );

  const footerContent = (
    <>
      <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-warning">Two Transactions Required</p>
          <p className="text-muted-foreground mt-1">
            1. Approve USDC spending for the factory contract
            <br />
            2. Create the trade escrow
          </p>
        </div>
      </div>

      {insufficientUsdc && (
        <div className="p-4 rounded-lg bg-danger/10 border border-danger/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-danger">Insufficient USDC Balance</p>
              <p className="text-danger/80 mt-1">
                {exceedsBalance
                  ? `You need ${sellAmount} USDC but only have ${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC.`
                  : `Your USDC balance is ${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Add USDC to create a trade.`
                }
              </p>
            </div>
          </div>
        </div>
      )}

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
        type="submit"
        disabled={isLoading || !buyToken || !sellAmount || step === 'success' || insufficientUsdc}
        className={`w-full py-4 rounded-lg font-medium disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors ${
          step === 'success'
            ? 'bg-green-600 text-white'
            : submitError
            ? 'bg-danger text-white'
            : insufficientUsdc
            ? 'bg-danger/50 text-white'
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
            Trade Created!
          </motion.div>
        ) : isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {step === 'approve' && 'Approving USDC...'}
            {step === 'create' && 'Creating Trade...'}
            {step === 'confirming' && 'Confirming...'}
          </>
        ) : submitError ? (
          <>
            <XCircle className="w-5 h-5" />
            Try Again
          </>
        ) : insufficientUsdc ? (
          <>
            <AlertCircle className="w-5 h-5" />
            Insufficient USDC Balance
          </>
        ) : (
          <>
            <Check className="w-5 h-5" />
            Create Trade
          </>
        )}
      </motion.button>
    </>
  );

  if (modal) {
    return (
      <form
        onSubmit={handleSubmit}
        className="flex flex-col min-h-0 flex-1"
      >
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
          {scrollableContent}
        </div>
        <div className="flex-shrink-0 p-6 pt-4 border-t border-border space-y-4">
          {footerContent}
        </div>
      </form>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <div className="p-6 rounded-xl bg-muted border border-border space-y-6">
        {scrollableContent}
      </div>
      {footerContent}
    </motion.form>
  );
}
