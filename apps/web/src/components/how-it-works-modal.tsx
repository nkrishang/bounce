"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowDown, TrendingUp, Shield, Zap } from "lucide-react";

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

const GOLD = "#D4AD4A";
const BLUE = "#61A6FB";
const GREEN = "#4ade80";
const RED = "#E03537";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" },
  }),
};

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
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
                <h2 className="text-lg font-bold text-white">How Bounce Works</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-5">
                {/* ── Step 1: Believer Proposes ── */}
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={1}
                >
                  <StepHeader number={1} color={GOLD} title="Believer proposes a bet" />
                  <div className="mt-2.5 rounded-xl border border-white/[0.06] bg-[#111113] p-4">
                    <p className="text-[12.5px] text-white/60 mb-3">
                      Puts up <span className="font-semibold text-white/90">20%</span> of
                      the total bet size as their stake.
                    </p>
                    {/* Visual: $20 stake → $100 total */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] text-white/40">Your stake</span>
                          <span className="text-[11px] font-mono font-semibold" style={{ color: GOLD }}>
                            $20
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: GOLD }}
                            initial={{ width: 0 }}
                            animate={{ width: "20%" }}
                            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                      <ArrowDown className="w-4 h-4 text-white/20 rotate-[-90deg] shrink-0" />
                      <div className="text-center shrink-0">
                        <span className="text-[11px] text-white/40 block">Total bet</span>
                        <span className="text-sm font-mono font-bold text-white">$100</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* ── Step 2: Backer Funds ── */}
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={2}
                >
                  <StepHeader number={2} color={BLUE} title="Backer funds the rest" />
                  <div className="mt-2.5 rounded-xl border border-white/[0.06] bg-[#111113] p-4">
                    <p className="text-[12.5px] text-white/60 mb-3">
                      Fills the remaining <span className="font-semibold text-white/90">80%</span> with
                      built-in downside protection.
                    </p>
                    {/* Visual: Combined capital bar */}
                    <div className="space-y-2">
                      <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden flex">
                        <motion.div
                          className="h-full"
                          style={{ background: GOLD, borderRadius: "9999px 0 0 9999px" }}
                          initial={{ width: 0 }}
                          animate={{ width: "20%" }}
                          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
                        />
                        <motion.div
                          className="h-full"
                          style={{ background: BLUE, borderRadius: "0 9999px 9999px 0" }}
                          initial={{ width: 0 }}
                          animate={{ width: "80%" }}
                          transition={{ duration: 0.7, delay: 0.5, ease: "easeOut" }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: GOLD }}>
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: GOLD }} />
                          Believer 20%
                        </span>
                        <span style={{ color: BLUE }}>
                          Backer 80%
                          <span className="inline-block w-1.5 h-1.5 rounded-full ml-1" style={{ background: BLUE }} />
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* ── Step 3: Profit / Loss Scenarios ── */}
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={3}
                >
                  <StepHeader number={3} color="#fff" title="Settle & split" />
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                    {/* Win Scenario */}
                    <div className="rounded-xl border border-[#4ade80]/20 bg-[#0f1a14] p-3.5">
                      <div className="flex items-center gap-1.5 mb-3">
                        <TrendingUp className="w-4 h-4" style={{ color: GREEN }} />
                        <span className="text-[13px] font-semibold" style={{ color: GREEN }}>
                          If Win
                        </span>
                      </div>
                      {/* Profit split bar */}
                      <div className="space-y-2.5">
                        <p className="text-[11px] text-white/50 leading-relaxed">
                          Believer-Backer split profits
                        </p>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px]" style={{ color: GOLD }}>Believer</span>
                            <span className="text-[10px] font-mono font-bold" style={{ color: GOLD }}>60%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: GOLD }}
                              initial={{ width: 0 }}
                              animate={{ width: "60%" }}
                              transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px]" style={{ color: BLUE }}>Backer</span>
                            <span className="text-[10px] font-mono font-bold" style={{ color: BLUE }}>40%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: BLUE }}
                              initial={{ width: 0 }}
                              animate={{ width: "40%" }}
                              transition={{ duration: 0.5, delay: 0.7, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: `${GREEN}15`, color: GREEN }}
                        >
                          3X PROFIT
                        </span>
                      </div>
                    </div>

                    {/* Loss Scenario */}
                    <div className="rounded-xl border border-[#E03537]/20 bg-[#1a0f11] p-3.5">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Shield className="w-4 h-4" style={{ color: RED }} />
                        <span className="text-[13px] font-semibold" style={{ color: RED }}>
                          If Loss
                        </span>
                      </div>
                      {/* Loss absorption visual */}
                      <div className="space-y-2.5">
                        <p className="text-[11px] text-white/50 leading-relaxed">
                          Believer&apos;s 20% absorbs losses first
                        </p>
                        {/* Visual: loss zone */}
                        <div>
                          <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden flex relative">
                            <motion.div
                              className="h-full"
                              style={{
                                background: `${RED}50`,
                                borderRadius: "9999px 0 0 9999px",
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: "20%" }}
                              transition={{ duration: 0.5, delay: 0.8, ease: "easeOut" }}
                            />
                            <motion.div
                              className="h-full"
                              style={{
                                background: `${BLUE}30`,
                                borderRadius: "0 9999px 9999px 0",
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: "80%" }}
                              transition={{ duration: 0.6, delay: 1.0, ease: "easeOut" }}
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[10px]" style={{ color: RED }}>
                              At risk
                            </span>
                            <span className="text-[10px]" style={{ color: BLUE }}>
                              Protected
                            </span>
                          </div>
                        </div>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: `${BLUE}12`, color: BLUE }}
                        >
                          20% Loss Protection
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function StepHeader({ number, color, title }: { number: number; color: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
        style={{
          background: `${color}15`,
          border: `1.5px solid ${color}40`,
          color,
        }}
      >
        {number}
      </div>
      <h3 className="text-[13px] font-semibold text-white">{title}</h3>
    </div>
  );
}
