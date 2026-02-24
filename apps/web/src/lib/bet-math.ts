'use client';

import { formatUnits } from 'viem';

export const BPS_DENOMINATOR = 10000;
export const DEFAULT_PROPOSER_CAPITAL_BPS = 2000; // 20%
export const DEFAULT_PROPOSER_PROFIT_SHARE_BPS = 6000; // 60%
export const DEFAULT_EXPIRY_DAYS = 7;

/**
 * I1. Profit Comparison (1x vs 3x)
 * Given a stake amount (proposer's 20%), compute the comparison.
 */
export function computeProfitComparison(
  stakeAmount: number,
  currentPrice: number,
  proposerCapitalBps: number = DEFAULT_PROPOSER_CAPITAL_BPS,
  proposerProfitShareBps: number = DEFAULT_PROPOSER_PROFIT_SHARE_BPS,
) {
  const proposerCapital = stakeAmount;
  const totalCapital = stakeAmount * (BPS_DENOMINATOR / proposerCapitalBps);
  const funderCapital = totalCapital - proposerCapital;
  const tokensReceived = totalCapital / currentPrice;

  // If market resolves YES (token worth $1)
  const revenue = tokensReceived; // $1 per token
  const profit = revenue - totalCapital;
  const proposerProfitShare = profit * (proposerProfitShareBps / BPS_DENOMINATOR);
  const proposerTotalReturn = proposerCapital + proposerProfitShare;
  const proposerMultiple = proposerCapital > 0 ? proposerTotalReturn / proposerCapital : 0;

  // Regular bet comparison
  const regularTokens = stakeAmount / currentPrice;
  const regularProfit = regularTokens - stakeAmount;
  const regularMultiple = stakeAmount > 0 ? (stakeAmount + regularProfit) / stakeAmount : 0;

  return {
    proposerCapital,
    totalCapital,
    funderCapital,
    tokensReceived,
    // Bounce 3x
    bounceProfit: proposerProfitShare,
    bounceReturn: proposerTotalReturn,
    bounceMultiple: proposerMultiple,
    // Regular 1x
    regularTokens,
    regularProfit,
    regularReturn: stakeAmount + regularProfit,
    regularMultiple,
  };
}

/**
 * I2. Wipeout Price Calculation
 * Price at which proposer's capital is fully lost.
 */
export function computeWipeoutPrice(
  currentPrice: number,
  proposerCapitalBps: number = DEFAULT_PROPOSER_CAPITAL_BPS,
): number {
  return currentPrice * (1 - proposerCapitalBps / BPS_DENOMINATOR);
}

/**
 * I3. Funder Protection Display
 */
export function computeFunderProtection(
  proposerCapitalBps: number = DEFAULT_PROPOSER_CAPITAL_BPS,
): number {
  return proposerCapitalBps / 100; // e.g., 20%
}

/**
 * Compute total capital from stake amount (proposer puts 20%)
 */
export function stakeToTotalCapital(
  stakeAmount: bigint,
  proposerCapitalBps: number = DEFAULT_PROPOSER_CAPITAL_BPS,
): bigint {
  return (stakeAmount * BigInt(BPS_DENOMINATOR)) / BigInt(proposerCapitalBps);
}

/**
 * Compute proposer and funder amounts from on-chain bet data
 */
export function computeWithdrawAmounts(
  totalReturned: bigint,
  totalCapital: bigint,
  proposerCapitalBps: number,
  proposerProfitShareBps: number,
): { proposerAmount: bigint; funderAmount: bigint } {
  const proposerCapital = (totalCapital * BigInt(proposerCapitalBps)) / BigInt(BPS_DENOMINATOR);
  const funderCapital = totalCapital - proposerCapital;

  if (totalReturned >= totalCapital) {
    // Profit case
    const profit = totalReturned - totalCapital;
    const proposerProfit = (profit * BigInt(proposerProfitShareBps)) / BigInt(BPS_DENOMINATOR);
    const funderProfit = profit - proposerProfit;
    return {
      proposerAmount: proposerCapital + proposerProfit,
      funderAmount: funderCapital + funderProfit,
    };
  } else {
    // Loss case - proposer absorbs first
    const loss = totalCapital - totalReturned;
    if (loss <= proposerCapital) {
      return {
        proposerAmount: proposerCapital - loss,
        funderAmount: funderCapital,
      };
    } else {
      const funderLoss = loss - proposerCapital;
      return {
        proposerAmount: 0n,
        funderAmount: funderCapital - funderLoss,
      };
    }
  }
}

/**
 * Format USDC amount (6 decimals) to display string
 */
export function formatUsdc(amount: bigint): string {
  return parseFloat(formatUnits(amount, 6)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compute PnL for active bets
 */
export function computeActivePnl(
  usdcSpent: bigint,
  currentValue: bigint,
) {
  const pnl = currentValue - usdcSpent;
  const isProfit = pnl >= 0n;
  const absPnl = isProfit ? pnl : -pnl;
  const pnlPercent = usdcSpent > 0n
    ? Number((pnl * 10000n) / usdcSpent) / 100
    : 0;

  return {
    pnl,
    isProfit,
    absPnl,
    pnlPercent,
  };
}
