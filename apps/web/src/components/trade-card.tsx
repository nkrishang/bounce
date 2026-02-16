'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Clock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { type TradeView, type TokenMeta, formatAddress, calculateFunderContribution } from '@thesis/shared';
import { formatUnits } from 'viem';
import { useTokenMeta } from '@/hooks/use-token';
import { useTokenList } from '@/hooks/use-token-list';
import { TokenAvatar } from './token-avatar';
import { CountdownTimer } from './countdown-timer';
import { InvestModal } from './invest-modal';

interface TradeCardProps {
  trade: TradeView;
}

export function TradeCard({ trade }: TradeCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [justExpired, setJustExpired] = useState(false);
  const { data: buyTokenMeta } = useTokenMeta(trade.chainId, trade.data.buyToken);
  const { data: tokenList = [] } = useTokenList();

  const tokenFromList = useMemo(() => {
    return tokenList.find(
      (t) => t.address.toLowerCase() === trade.data.buyToken.toLowerCase()
    );
  }, [tokenList, trade.data.buyToken]);

  const displayTokenMeta = useMemo((): TokenMeta | null => {
    if (tokenFromList) {
      return {
        address: tokenFromList.address,
        symbol: tokenFromList.symbol,
        name: tokenFromList.name,
        decimals: buyTokenMeta?.decimals ?? 18,
        logoUrl: tokenFromList.logoURI,
      };
    }
    return buyTokenMeta ?? null;
  }, [tokenFromList, buyTokenMeta]);

  const sellAmount = formatUnits(BigInt(trade.data.sellAmount), 6);
  const fundingNeeded = formatUnits(
    BigInt(calculateFunderContribution(trade.data.sellAmount)),
    6
  );
  const totalPosition = formatUnits(BigInt(trade.data.sellAmount) * 5n, 6);

  const isExpiredFromStatus = trade.status === 'EXPIRED_UNFUNDED';
  const isExpired = isExpiredFromStatus || justExpired;

  const handleExpire = useCallback(() => {
    setJustExpired(true);
    setShowModal(false);
  }, []);

  return (
    <>
      <motion.div
        whileHover={{ scale: isExpired ? 1 : 1.01 }}
        animate={justExpired ? { opacity: [1, 0.5], scale: [1, 0.98] } : {}}
        transition={justExpired ? { duration: 0.5 } : {}}
        className={`p-5 rounded-xl bg-muted border transition-all relative overflow-hidden ${
          isExpired
            ? 'opacity-50 cursor-not-allowed border-danger/30 grayscale'
            : 'border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 cursor-pointer'
        }`}
        onClick={() => !isExpired && setShowModal(true)}
      >
        <AnimatePresence>
          {justExpired && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 bg-danger/10 flex items-center justify-center z-10"
            >
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger/20 border border-danger/30">
                <AlertCircle className="w-5 h-5 text-danger" />
                <span className="font-medium text-danger">Trade Expired</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <TokenAvatar
                src={displayTokenMeta?.logoUrl}
                name={trade.data.buyToken}
                alt={displayTokenMeta?.symbol}
                size={40}
              />
              <div>
                <h3 className="font-semibold">
                  {displayTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {displayTokenMeta?.name || 'Loading...'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Proposer Stake</p>
                <p className="font-mono font-medium">${parseFloat(sellAmount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Funding Needed</p>
                <p className="font-mono font-medium text-primary">
                  ${parseFloat(fundingNeeded).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Position</p>
                <p className="font-mono font-medium">
                  ${parseFloat(totalPosition).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {formatAddress(trade.data.proposer)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <CountdownTimer
                  expirationTimestamp={trade.data.expirationTimestamp}
                  onExpire={handleExpire}
                />
              </span>
            </div>
          </div>

          {!isExpired && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              onClick={(e) => {
                e.stopPropagation();
                setShowModal(true);
              }}
            >
              Invest
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      </motion.div>

      <InvestModal
        trade={trade}
        buyTokenMeta={displayTokenMeta}
        open={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
