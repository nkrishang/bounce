'use client';

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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-muted border border-border rounded-xl shadow-2xl overflow-hidden w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold">Boosted Buy</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-background transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                {!isAuthenticated ? (
                  <div className="text-center space-y-4 py-8">
                    <h3 className="text-xl font-bold">Connect to Create a Trade</h3>
                    <p className="text-muted-foreground">Sign in to propose a new trade.</p>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={login}
                      className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium"
                    >
                      Sign In
                    </motion.button>
                  </div>
                ) : (
                  <CreateTradeForm initialToken={initialToken} onSuccess={onClose} />
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
