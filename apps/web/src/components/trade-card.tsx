'use client';

import { motion } from 'framer-motion';
import { Clock, User, Coins, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { type TradeView, formatAddress, calculateFunderContribution } from '@escape/shared';
import { formatUnits } from 'viem';
import { useTokenMeta } from '@/hooks/use-token';
import { CountdownTimer } from './countdown-timer';
import { InvestModal } from './invest-modal';

interface TradeCardProps {
  trade: TradeView;
}

export function TradeCard({ trade }: TradeCardProps) {
  const [showModal, setShowModal] = useState(false);
  const { data: buyTokenMeta } = useTokenMeta(trade.data.buyToken);

  const sellAmount = formatUnits(BigInt(trade.data.sellAmount), 6);
  const fundingNeeded = formatUnits(
    BigInt(calculateFunderContribution(trade.data.sellAmount)),
    6
  );
  const totalPosition = formatUnits(BigInt(trade.data.sellAmount) * 5n, 6);

  const isExpired = trade.status === 'EXPIRED_UNFUNDED';

  return (
    <>
      <motion.div
        whileHover={{ scale: isExpired ? 1 : 1.01 }}
        className={`p-5 rounded-xl bg-muted border border-border transition-all ${
          isExpired
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 cursor-pointer'
        }`}
        onClick={() => !isExpired && setShowModal(true)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Coins className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">
                  {buyTokenMeta?.symbol || formatAddress(trade.data.buyToken)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {buyTokenMeta?.name || 'Loading...'}
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
                  onExpire={() => {}}
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
        buyTokenMeta={buyTokenMeta}
        open={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
