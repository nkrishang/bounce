"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, LogOut, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { WalletModal } from "./wallet-modal";
import { HowItWorksModal } from "./how-it-works-modal";
import { formatAddress } from "@thesis/shared";

export function Navbar() {
  const pathname = usePathname();
  const { isReady, isAuthenticated, login, logout, address, walletsLoading } =
    useAuth();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-surface border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="text-dark-surface-foreground font-bold text-lg tracking-tight"
            >
              BOUNCE.CAPITAL
            </Link>

            <div className="flex items-center gap-6">
              <Link
                href="/my-trades"
                className={`text-sm font-medium transition-colors ${
                  pathname === "/my-trades"
                    ? "text-primary"
                    : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground"
                }`}
              >
                My Trades
              </Link>
              <button
                onClick={() => setShowHowItWorks(true)}
                className="text-sm font-medium text-dark-surface-foreground/70 hover:text-dark-surface-foreground transition-colors"
              >
                How it works
              </button>
            </div>

            <div className="flex items-center gap-3">
              {!isReady ? (
                <div className="px-4 py-2 rounded-lg bg-dark-surface border border-dark-border">
                  <span className="text-sm text-dark-surface-foreground/50">
                    Loading...
                  </span>
                </div>
              ) : isAuthenticated ? (
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-3 px-4 py-2 rounded-lg bg-dark-surface border border-dark-border hover:border-primary/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded bg-[#E85D4A] flex-shrink-0" />
                    <div className="text-left">
                      <span className="font-mono text-sm text-dark-surface-foreground block">
                        {walletsLoading
                          ? "Loading..."
                          : address
                            ? formatAddress(address)
                            : "No wallet"}
                      </span>
                      <span className="text-xs text-dark-surface-foreground/50">
                        Manage wallet
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-dark-surface-foreground/50" />
                  </motion.button>

                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-0 mt-2 w-48 rounded-lg bg-dark-surface border border-dark-border shadow-xl overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          setShowWalletModal(true);
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-dark-surface-foreground hover:bg-white/10 transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                        View Wallet
                      </button>
                      <button
                        onClick={() => {
                          logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-danger hover:bg-white/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </motion.div>
                  )}
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={login}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm"
                >
                  Connect Wallet
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <WalletModal
        open={showWalletModal}
        onClose={() => setShowWalletModal(false)}
      />
      <HowItWorksModal
        open={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
      />
    </>
  );
}
