"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, LogOut, ChevronDown, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Facehash } from "facehash";
import { useAuth } from "@/hooks/use-auth";
import { WalletModal } from "./wallet-modal";
import { formatAddress } from "@bounce/shared";

const FACEHASH_COLORS = ['#8B5CF6', '#EC4899', '#F97316', '#06B6D4', '#10B981', '#6366F1', '#F43F5E', '#A855F7', '#14B8A6', '#EAB308'];

export function Navbar() {
  const pathname = usePathname();
  const { isReady, isAuthenticated, login, logout, address, walletsLoading } =
    useAuth();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-surface border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-dark-surface-foreground font-bold text-lg tracking-tight"
              >
                <Image src="/logos/bounce-cap.svg" alt="Bounce Capital" width={28} height={28} />
                <span className="hidden md:inline">BOUNCE.CAPITAL</span>
              </Link>

              <Link
                href="/"
                className={`hidden sm:block text-sm font-medium transition-colors ${
                  pathname === "/"
                    ? "text-primary"
                    : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground"
                }`}
              >
                Explore
              </Link>
              <Link
                href="/my-trades"
                className={`hidden sm:block text-sm font-medium transition-colors ${
                  pathname === "/my-trades"
                    ? "text-primary"
                    : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground"
                }`}
              >
                My Trades
              </Link>
              <Link
                href="/polymarket"
                className={`hidden sm:block text-sm font-medium transition-colors ${
                  pathname === "/polymarket"
                    ? "text-primary"
                    : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground"
                }`}
              >
                Polymarket
              </Link>
            </div>

            {/* Desktop wallet/auth */}
            <div className="hidden sm:flex items-center gap-3">
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
                    <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                      <Facehash
                        name={address ?? ''}
                        size={32}
                        showInitial={false}
                        colors={FACEHASH_COLORS}
                      />
                    </div>
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

            {/* Mobile menu button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="flex sm:hidden items-center gap-2 p-2 rounded-lg text-dark-surface-foreground/70 hover:text-dark-surface-foreground hover:bg-white/5 transition-colors"
            >
              {isAuthenticated && address && (
                <div className="w-7 h-7 rounded overflow-hidden flex-shrink-0">
                  <Facehash
                    name={address}
                    size={28}
                    showInitial={false}
                    colors={FACEHASH_COLORS}
                  />
                </div>
              )}
              {showMobileMenu ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        <AnimatePresence>
          {showMobileMenu && (
            <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 top-16 bg-black/40 sm:hidden z-40"
              onClick={() => setShowMobileMenu(false)}
            />
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="sm:hidden overflow-hidden border-t border-dark-border relative z-50"
            >
              <div className="px-4 py-3 space-y-1">
                <Link
                  href="/"
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === "/"
                      ? "text-primary bg-primary/10"
                      : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground hover:bg-white/5"
                  }`}
                >
                  Explore
                </Link>
                <Link
                  href="/my-trades"
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === "/my-trades"
                      ? "text-primary bg-primary/10"
                      : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground hover:bg-white/5"
                  }`}
                >
                  My Trades
                </Link>
                <Link
                  href="/polymarket"
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === "/polymarket"
                      ? "text-primary bg-primary/10"
                      : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground hover:bg-white/5"
                  }`}
                >
                  Polymarket
                </Link>

                <div className="pt-2 border-t border-dark-border">
                  {!isReady ? (
                    <div className="px-3 py-2.5">
                      <span className="text-sm text-dark-surface-foreground/50">
                        Loading...
                      </span>
                    </div>
                  ) : isAuthenticated ? (
                    <>
                      <button
                        onClick={() => {
                          setShowWalletModal(true);
                          setShowMobileMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-dark-surface-foreground hover:bg-white/5 transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                        View Wallet
                      </button>
                      <button
                        onClick={() => {
                          logout();
                          setShowMobileMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-danger hover:bg-white/5 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        login();
                        setShowMobileMenu(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm text-center"
                    >
                      Connect Wallet
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
            </>
          )}
        </AnimatePresence>
      </nav>

      <WalletModal
        open={showWalletModal}
        onClose={() => setShowWalletModal(false)}
      />
    </>
  );
}
