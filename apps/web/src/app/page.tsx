"use client";

export const dynamic = "force-dynamic";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, TrendingUp, Shield } from "lucide-react";
import Link from "next/link";
import { TradeGrid } from "@/components/trade-grid";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { isAuthenticated, login } = useAuth();

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="space-y-4">
              <h1 className="text-3xl lg:text-5xl lg:font-semibold tracking-tight">
                <span className="gradient-text">Conviction Meets Capital</span>
              </h1>

              <p className="text-lg text-muted-foreground max-w-md">
                Proposers discover bets and put up 20% capital. Funders provide
                the remaining 80%.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <TrendingUp className="w-5 h-5 text-success" />
                </div>
                <div>
                  <h3 className="font-medium">Profit Together</h3>
                  <p className="text-sm text-muted-foreground">
                    Proposers earn 30% of profits. Funders get 70% on trades
                    they never had to find.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Protected Downside</h3>
                  <p className="text-sm text-muted-foreground">
                    Proposers absorb losses first. Funders are shielded by the
                    proposer&apos;s stake.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              {isAuthenticated ? (
                <Link href="/create-trade">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                  >
                    Propose a Trade
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={login}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}

              <Link href="/my-trades">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors"
                >
                  View My Trades
                </motion.button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/10 rounded-3xl blur-3xl -z-10" />
            <TradeGrid />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
