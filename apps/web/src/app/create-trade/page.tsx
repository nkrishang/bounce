'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Coins, Clock, FileText, AlertCircle, Check, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useCreateTrade } from '@/hooks/use-create-trade';
import { parseUnits } from 'viem';
import { TokenSelector } from '@/components/token-selector';
import { ContributionInput } from '@/components/contribution-input';
import { parseTransactionError } from '@/lib/parse-transaction-error';
import type { TokenInfo } from '@/hooks/use-token-list';

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS;

const EXPIRATION_OPTIONS = [
  { label: '5 minutes', value: 5 * 60 },
  { label: '15 minutes', value: 15 * 60 },
  { label: '1 hour', value: 60 * 60 },
  { label: '6 hours', value: 6 * 60 * 60 },
  { label: '24 hours', value: 24 * 60 * 60 },
];

export default function CreateTradePage() {
  const router = useRouter();
  const { isAuthenticated, login, address } = useAuth();
  const { createTrade, isLoading, step, error } = useCreateTrade();

  const [buyToken, setBuyToken] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [sellAmount, setSellAmount] = useState('');
  const [expirationSeconds, setExpirationSeconds] = useState(EXPIRATION_OPTIONS[2].value);
  const [thesis, setThesis] = useState('');
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => {
        router.push('/my-trades');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [step, router]);

  const handleTokenChange = (tokenAddress: string, token?: TokenInfo) => {
    setBuyToken(tokenAddress);
    setSelectedToken(token ?? null);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h2 className="text-2xl font-bold">Connect to Create a Trade</h2>
          <p className="text-muted-foreground">Sign in to propose a new trade.</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={login}
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            Sign In
          </motion.button>
        </motion.div>
      </div>
    );
  }

  const fundingNeeded = sellAmount ? (parseFloat(sellAmount) * 4).toFixed(2) : '0';
  const totalPosition = sellAmount ? (parseFloat(sellAmount) * 5).toFixed(2) : '0';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyToken || !sellAmount || !address) return;

    setSubmitError(null);

    try {
      await createTrade({
        buyToken: buyToken as `0x${string}`,
        sellAmount: parseUnits(sellAmount, 6),
        expirationSeconds,
        metadataUri: thesis ? JSON.stringify({ thesis }) : '',
      });
    } catch (err) {
      console.error('Failed to create trade:', err);
      setSubmitError(parseTransactionError(err));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <h1 className="text-3xl font-bold">Create Trade</h1>
        <p className="text-muted-foreground mt-2">
          Propose a token purchase and invite funders to co-invest
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <div className="p-6 rounded-xl bg-muted border border-border space-y-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Coins className="w-4 h-4 text-muted-foreground" />
              Token to Buy
            </label>
            <TokenSelector
              value={buyToken}
              onChange={handleTokenChange}
              usdcAddress={USDC_ADDRESS}
            />
            <p className="text-xs text-muted-foreground">
              Select from the list or add a custom token address
            </p>
          </div>

          <ContributionInput
            value={sellAmount}
            onChange={setSellAmount}
            address={address}
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
                  {selectedToken.logoURI && (
                    <img
                      src={selectedToken.logoURI}
                      alt={selectedToken.symbol}
                      className="w-4 h-4 rounded-full"
                    />
                  )}
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
          disabled={isLoading || !buyToken || !sellAmount || step === 'success'}
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
          ) : (
            <>
              <Check className="w-5 h-5" />
              Create Trade
            </>
          )}
        </motion.button>
      </motion.form>
    </div>
  );
}
