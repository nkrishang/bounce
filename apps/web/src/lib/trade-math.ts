import type { TradeView } from '@thesis/shared';
import { formatUnits } from 'viem';

interface ExpectedOutcomes {
  isProfit: boolean;
  proposerExpectedPayout: string;
  funderExpectedPayout: string;
  funderProtection: string;
  proposerBonus: string;
}

export function computeActiveExpectedOutcomes(
  trade: TradeView,
  currentValueUsdc: bigint | null
): ExpectedOutcomes | null {
  if (currentValueUsdc === null) return null;

  const P = BigInt(trade.state.proposerContribution);
  const S = BigInt(trade.state.totalSellIn);
  const R = currentValueUsdc;

  let proposerPayout: bigint;
  let funderPayout: bigint;
  let funderProtection = 0n;
  let proposerBonus = 0n;
  const isProfit = R >= S;

  if (isProfit) {
    const profit = R - S;
    proposerPayout = P + (profit * 30n) / 100n;
    funderPayout = R - proposerPayout;
    // Bonus = instrument payout - what they'd earn investing P directly
    // Direct return = P * R / S, so bonus = proposerPayout - (P * R / S)
    const directReturn = S > 0n ? (P * R) / S : 0n;
    proposerBonus = proposerPayout > directReturn ? proposerPayout - directReturn : 0n;
  } else {
    const loss = S - R;
    if (loss >= P) {
      proposerPayout = 0n;
      funderPayout = R;
      funderProtection = P;
    } else {
      proposerPayout = P - loss;
      funderPayout = R - proposerPayout;
      funderProtection = loss;
    }
  }

  return {
    isProfit,
    proposerExpectedPayout: formatUnits(proposerPayout, 6),
    funderExpectedPayout: formatUnits(funderPayout, 6),
    funderProtection: formatUnits(funderProtection, 6),
    proposerBonus: formatUnits(proposerBonus, 6),
  };
}

interface SoldMetrics {
  yourInvestment: string;
  costBasis: string;
  returnValue: string;
  positionPnl: { isProfit: boolean; amount: string; percent: number };
  yourPnl: { isProfit: boolean; amount: string; percent: number };
  protection: string;
  protectionPercent: number;
  bonus: string;
  bonusPercent: number;
  role: 'proposer' | 'funder';
}

export function computeSoldMetrics(
  trade: TradeView,
  role: 'proposer' | 'funder'
): SoldMetrics {
  const totalSellIn = BigInt(trade.state.totalSellIn);
  const finalSellAmount = BigInt(trade.state.finalSellAmount);

  const myContribution = BigInt(
    role === 'proposer' ? trade.state.proposerContribution : trade.state.funderContribution
  );
  const myPayout = BigInt(
    role === 'proposer' ? trade.state.proposerPayout : trade.state.funderPayout
  );

  const positionDiff = finalSellAmount - totalSellIn;
  const positionPnlAbs = positionDiff < 0n ? -positionDiff : positionDiff;

  const myDiff = myPayout - myContribution;
  const myPnlAbs = myDiff < 0n ? -myDiff : myDiff;

  const proposerContribution = BigInt(trade.state.proposerContribution);
  const proposerPayout = BigInt(trade.state.proposerPayout);
  const proposerLoss = proposerContribution - proposerPayout;
  const protection = proposerLoss > 0n ? proposerLoss : 0n;

  const positionPnlPercent = totalSellIn > 0n
    ? Number((positionDiff * 10000n) / totalSellIn) / 100
    : 0;
  const yourPnlPercent = myContribution > 0n
    ? Number((myDiff * 10000n) / myContribution) / 100
    : 0;
  const protectionPercent = totalSellIn > 0n
    ? Number((protection * 10000n) / totalSellIn) / 100
    : 0;

  // Bonus: extra earned by proposer beyond a direct proportional return
  // directReturn = P * R / S, bonus = proposerPayout - directReturn
  let bonus = 0n;
  if (positionDiff >= 0n && finalSellAmount > 0n) {
    const directReturn = totalSellIn > 0n ? (proposerContribution * finalSellAmount) / totalSellIn : 0n;
    bonus = proposerPayout > directReturn ? proposerPayout - directReturn : 0n;
  }
  const bonusPercent = proposerContribution > 0n
    ? Number((bonus * 10000n) / proposerContribution) / 100
    : 0;

  return {
    yourInvestment: formatUnits(myContribution, 6),
    costBasis: formatUnits(totalSellIn, 6),
    returnValue: formatUnits(myPayout, 6),
    positionPnl: {
      isProfit: positionDiff >= 0n,
      amount: formatUnits(positionPnlAbs, 6),
      percent: positionPnlPercent,
    },
    yourPnl: {
      isProfit: myDiff >= 0n,
      amount: formatUnits(myPnlAbs, 6),
      percent: yourPnlPercent,
    },
    protection: formatUnits(protection, 6),
    protectionPercent,
    bonus: formatUnits(bonus, 6),
    bonusPercent,
    role,
  };
}
