"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

const sections = [
  {
    title: "Boosted Buy (For Believers)",
    items: [
      "You find a token you believe in and put up 20% of the trade size as your stake",
      "Your capital is escrowed while waiting for a Backer to fund the remaining 80%",
      "You earn 60% of any profits as reward for your conviction and risk",
    ],
  },
  {
    title: "Protected Buy (For Backers)",
    items: [
      "You fund the remaining 80% of a Believer\u2019s proposed trade",
      "The token is bought immediately using the combined 100% capital",
      "Your downside is protected: the Believer\u2019s 20% stake absorbs the first losses",
    ],
  },
  {
    title: "How Profits Work",
    items: [
      "The position can be sold back to USDC at any time by either party",
      "On profit: Each gets back their initial capital, then profits split 60% Believer / 40% Backer",
      "On loss: Up to the first 20% loss comes entirely from the Believer\u2019s position, protecting the Backer",
    ],
  },
  {
    title: "Why the Split?",
    items: [
      "The 60/40 profit split compensates the Believer for finding the trade and taking on first-loss risk",
      "Backers pay for downside protection from their profit share",
    ],
  },
];

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
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
            <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl overflow-hidden w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-dark-border">
                <h2 className="text-lg font-semibold text-dark-surface-foreground">
                  How BOUNCE.CAPITAL Works
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-dark-surface-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {sections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <h3 className="text-sm font-semibold text-primary">
                      {section.title}
                    </h3>
                    <ul className="space-y-2">
                      {section.items.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-dark-surface-foreground/80"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
