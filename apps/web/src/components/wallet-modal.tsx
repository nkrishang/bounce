'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, ExternalLink, RefreshCw, Check } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useWalletBalance } from '@/hooks/use-wallet';
import { formatAddress } from '@escape/shared';
import { formatUnits } from 'viem';

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { address } = useAuth();
  const { data: balance, isLoading: balanceLoading, refetch } = useWalletBalance(address);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedBalance = balance
    ? formatUnits(BigInt(balance), 6)
    : '0';

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
                <h2 className="text-lg font-semibold">Your Wallet</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-background transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Address</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-3 rounded-lg bg-background font-mono text-sm truncate">
                      {address}
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleCopy}
                      className="p-3 rounded-lg bg-background hover:bg-border transition-colors"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </motion.button>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">USDC Balance</span>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => refetch()}
                      disabled={balanceLoading}
                      className="p-1 rounded hover:bg-white/10 transition-colors"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${balanceLoading ? 'animate-spin' : ''}`}
                      />
                    </motion.button>
                  </div>
                  <div className="text-3xl font-bold font-mono">
                    ${parseFloat(formattedBalance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    To fund your wallet, send USDC to the address above from an external wallet or
                    exchange.
                  </p>
                  <a
                    href={`https://monadexplorer.com/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    View on Explorer
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
