"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, ExternalLink, RefreshCw, Check, Wallet } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWalletBalances } from "@/hooks/use-wallet";
import { formatAddress } from "@thesis/shared";
import { formatUnits } from "viem";

const CHAIN_META: Record<number, { name: string; logo: string; explorer: string }> = {
  137: { name: "Polygon", logo: "/logos/polygon-logo.svg", explorer: "https://polygonscan.com" },
  8453: { name: "Base", logo: "/logos/base-logo.svg", explorer: "https://basescan.org" },
  143: { name: "Monad", logo: "/logos/monad-logo.svg", explorer: "https://explorer.monad.xyz" },
};

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { embeddedWalletAddress, externalWalletAddress, address } = useAuth();
  const displayAddress = embeddedWalletAddress ?? address;
  const {
    data: balances,
    isLoading: balanceLoading,
    refetch,
  } = useWalletBalances(displayAddress);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!displayAddress) return;
    await navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md pointer-events-auto"
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
                    <label className="text-sm text-muted-foreground">
                      {embeddedWalletAddress
                        ? "Deposit Address"
                        : "Wallet Address"}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-4 py-3 rounded-lg bg-background font-mono text-sm truncate">
                        {displayAddress ?? "Loading..."}
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

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        USDC Balances
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => refetch()}
                        disabled={balanceLoading}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${balanceLoading ? "animate-spin" : ""}`}
                        />
                      </motion.button>
                    </div>
                    {([137, 8453, 143] as const).map((chainId) => {
                      const chain = CHAIN_META[chainId];
                      const bal = balances?.[chainId] ?? "0";
                      const formatted = formatUnits(BigInt(bal), 6);
                      return (
                        <div
                          key={chainId}
                          className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={chain.logo}
                              alt={chain.name}
                              className="w-5 h-5"
                            />
                            <span className="text-sm font-medium">
                              {chain.name}
                            </span>
                          </div>
                          <span className="font-mono text-sm">
                            $
                            {parseFloat(formatted).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {externalWalletAddress && embeddedWalletAddress && (
                    <div className="p-3 rounded-lg bg-background border border-border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Wallet className="w-4 h-4" />
                        <span>Signed up with wallet:</span>
                      </div>
                      <div className="mt-1 font-mono text-sm truncate">
                        {externalWalletAddress}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      To fund your wallet, send USDC to your deposit address
                      from an external wallet or exchange.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {([137, 8453, 143] as const).map((chainId) => {
                        const chain = CHAIN_META[chainId];
                        return (
                          <a
                            key={chainId}
                            href={`${chain.explorer}/address/${displayAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                          >
                            <img
                              src={chain.logo}
                              alt={chain.name}
                              className="w-3.5 h-3.5"
                            />
                            {chain.name}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
