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
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="flex items-center text-dark-surface-foreground font-bold text-lg tracking-tight"
              >
                <Image
                  src="/logos/Bounce-Logo-No-Background-Full.svg"
                  alt="Bounce Capital"
                  width={140}
                  height={32}
                  className="hidden md:block"
                />
                <Image
                  src="/logos/Bounce-Logo-No-Background.svg"
                  alt="Bounce Capital"
                  width={28}
                  height={28}
                  className="md:hidden"
                />
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
              <Link
                href="/my-bets"
                className={`hidden sm:block text-sm font-medium transition-colors ${
                  pathname === "/my-bets"
                    ? "text-primary"
                    : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground"
                }`}
              >
                My Bets
              </Link>
            </div>

            {/* Desktop wallet/auth */}
            <div className="hidden sm:flex items-center">
              {!isReady ? (
                <div className="px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.07]">
                  <span className="text-sm text-white/30">Loading...</span>
                </div>
              ) : isAuthenticated ? (
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.09] hover:bg-white/[0.09] hover:border-white/[0.15] transition-all duration-200 shadow-lg shadow-black/20"
                  >
                    {/* Avatar with online indicator */}
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-primary/30">
                        <Facehash
                          name={address ?? ''}
                          size={32}
                          showInitial={false}
                          colors={FACEHASH_COLORS}
                        />
                      </div>
                      <span className="absolute -bottom-px -right-px block w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-dark-surface" />
                    </div>

                    <div className="flex flex-col items-start">
                      <span className="font-mono text-xs text-white/90 font-semibold leading-tight tracking-tight">
                        {walletsLoading
                          ? "Loading..."
                          : address
                            ? formatAddress(address)
                            : "No wallet"}
                      </span>
                      <span className="text-[10px] text-white/35 leading-tight">Connected</span>
                    </div>

                    <ChevronDown
                      className={`w-3.5 h-3.5 text-white/30 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`}
                    />
                  </motion.button>

                  <AnimatePresence>
                    {showUserMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-56 rounded-2xl bg-dark-surface/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/60 overflow-hidden"
                      >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-white/[0.06]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                              <Facehash
                                name={address ?? ''}
                                size={32}
                                showInitial={false}
                                colors={FACEHASH_COLORS}
                              />
                            </div>
                            <div>
                              <p className="font-mono text-xs text-white/80 font-semibold">
                                {address ? formatAddress(address) : "No wallet"}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span className="text-[10px] text-white/40">Connected</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-1.5">
                          <button
                            onClick={() => {
                              setShowWalletModal(true);
                              setShowUserMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/75 hover:bg-white/[0.07] hover:text-white transition-all duration-150"
                          >
                            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                              <Wallet className="w-3.5 h-3.5 text-primary" />
                            </div>
                            View Wallet
                          </button>
                          <button
                            onClick={() => {
                              logout();
                              setShowUserMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400/80 hover:bg-red-500/[0.08] hover:text-red-400 transition-all duration-150"
                          >
                            <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                              <LogOut className="w-3.5 h-3.5 text-red-400/70" />
                            </div>
                            Sign Out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={login}
                  className="px-5 py-2 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/20 hover:shadow-primary/35 transition-all duration-200"
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
                <Link
                  href="/my-bets"
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === "/my-bets"
                      ? "text-primary bg-primary/10"
                      : "text-dark-surface-foreground/70 hover:text-dark-surface-foreground hover:bg-white/5"
                  }`}
                >
                  My Bets
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
