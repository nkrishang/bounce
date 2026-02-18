'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type TradeView, type TokenMeta } from '@bounce/shared';
import { InvestContent } from './invest-content';

interface InvestModalProps {
  trade: TradeView;
  buyTokenMeta?: TokenMeta | null;
  open: boolean;
  onClose: () => void;
  previewMode?: boolean;
}

export function InvestModal({ trade, buyTokenMeta, open, onClose, previewMode = false }: InvestModalProps) {
  const router = useRouter();

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

  return createPortal(
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
            <div className="bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-dark-border">
                <h2 className="text-lg font-bold text-white">Back this Trade</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <InvestContent
                trade={trade}
                buyTokenMeta={buyTokenMeta}
                previewMode={previewMode}
                onExpire={onClose}
                onFundSuccess={() => router.push('/my-trades?tab=active')}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
