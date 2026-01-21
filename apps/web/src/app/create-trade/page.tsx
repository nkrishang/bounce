'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Coins, Clock, FileText, AlertCircle, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useCreateTrade } from '@/hooks/use-create-trade';
import { formatUnits, parseUnits } from 'viem';

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
  const [sellAmount, setSellAmount] = useState('');
  const [expirationSeconds, setExpirationSeconds] = useState(EXPIRATION_OPTIONS[2].value);
  const [thesis, setThesis] = useState('');

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

    try {
      await createTrade({
        buyToken: buyToken as `0x${string}`,
        sellAmount: parseUnits(sellAmount, 6),
        expirationSeconds,
        metadataUri: thesis ? JSON.stringify({ thesis }) : '',
      });
      router.push('/my-trades');
    } catch (err) {
      console.error('Failed to create trade:', err);
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
            <input
              type="text"
              placeholder="0x... (token contract address)"
              value={buyToken}
              onChange={(e) => setBuyToken(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the contract address of the token you want to purchase
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Coins className="w-4 h-4 text-muted-foreground" />
              Your Contribution (USDC)
            </label>
            <input
              type="number"
              placeholder="100"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              min="0"
              step="0.01"
              className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              required
            />
            <p className="text-xs text-muted-foreground">
              This is your 20% stake. You&apos;ll ask funders for 4x this amount.
            </p>
          </div>

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
            <textarea
              placeholder="Why is this a good trade? (max 50 words)"
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {thesis.split(/\s+/).filter(Boolean).length}/50 words
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

        {error && (
          <div className="p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
            {error}
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={isLoading || !buyToken || !sellAmount}
          className="w-full py-4 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {step === 'approve' && 'Approving USDC...'}
              {step === 'create' && 'Creating Trade...'}
              {step === 'confirming' && 'Confirming...'}
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
