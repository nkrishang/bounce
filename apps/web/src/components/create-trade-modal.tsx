'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { CreateTradeForm } from '@/components/create-trade-form';

interface CreateTradeModalProps {
  open: boolean;
  onClose: () => void;
  initialToken?: {
    address: string;
    name: string;
    symbol: string;
    logoURI?: string;
    networkId?: number;
  } | null;
}

export function CreateTradeModal({ open, onClose, initialToken }: CreateTradeModalProps) {
  const { isAuthenticated, login } = useAuth();

  useEffect(() => {
    if (!open) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="relative bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg max-h-[90vh] flex flex-col">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-10 p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>

              {!isAuthenticated ? (
                <div className="text-center space-y-4 py-8 px-6">
                  <h3 className="text-xl font-bold text-white">Connect to Create a Trade</h3>
                  <p className="text-muted-foreground text-sm">Sign in to propose a new trade.</p>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={login}
                    className="px-6 py-3 rounded-xl font-bold text-[15px] transition-all duration-200"
                    style={{
                      background: 'rgba(236, 194, 94, 0.12)',
                      border: '1px solid rgba(236, 194, 94, 0.3)',
                      color: '#C8A93E',
                    }}
                  >
                    Sign In
                  </motion.button>
                </div>
              ) : (
                <CreateTradeForm initialToken={initialToken} onSuccess={onClose} modal />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
