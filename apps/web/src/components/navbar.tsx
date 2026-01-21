'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, PlusCircle, Briefcase, Wallet, LogOut, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { WalletModal } from './wallet-modal';
import { formatAddress } from '@escape/shared';

const navLinks = [
  { href: '/', label: 'Explore', icon: Compass },
  { href: '/my-trades', label: 'My Trades', icon: Briefcase },
  { href: '/create-trade', label: 'Create', icon: PlusCircle },
];

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, login, logout, address } = useAuth();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <motion.div
                  whileHover={{ rotate: 10 }}
                  className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center"
                >
                  <span className="text-white font-bold">E</span>
                </motion.div>
                <span className="font-semibold text-lg hidden sm:inline">escape</span>
              </Link>

              <div className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link key={link.href} href={link.href}>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        <link.icon className="w-4 h-4" />
                        {link.label}
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isAuthenticated && address ? (
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted border border-border hover:border-primary/50 transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-primary" />
                    <span className="font-mono text-sm">{formatAddress(address)}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </motion.button>

                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-0 mt-2 w-48 rounded-lg bg-muted border border-border shadow-xl overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          setShowWalletModal(true);
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-background transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                        View Wallet
                      </button>
                      <button
                        onClick={() => {
                          logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-danger hover:bg-background transition-colors"
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
                  Sign In
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <WalletModal open={showWalletModal} onClose={() => setShowWalletModal(false)} />
    </>
  );
}
