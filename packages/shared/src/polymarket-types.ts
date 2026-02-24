import type { Address } from './types.js';

export interface PolymarketToken {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  condition_id: string;
  slug: string;
  tokens: PolymarketToken[];
  active: boolean;
  closed: boolean;
  volume: string;
  volumeNum: number;
  volume_num: number;
  liquidity: string;
  endDateIso: string;
  end_date_iso: string;
  image: string;
  icon: string;
  description: string;
  outcomes: string;
  outcomePrices: string;
  outcome_prices: string;
  clobTokenIds: string;
  bestBid: number;
  best_bid: number;
  bestAsk: number;
  best_ask: number;
  negRisk: boolean;
}

// Mirror contract enum
export enum BetStatus {
  None = 0,
  Proposed = 1,
  Funded = 2,
  Traded = 3,
  Closed = 4,
  Cancelled = 5,
  Withdrawn = 6,
}

// On-chain bet struct (from Bounce.getBet)
export interface BetOnchain {
  safe: Address;
  proposer: Address;
  funder: Address;
  exchange: Address;
  conditionId: `0x${string}`;
  outcomeIndex: number;
  indexSet: bigint;
  positionId: bigint;
  slugHash: `0x${string}`;
  totalCapital: bigint;
  proposerCapitalBps: number;
  proposerProfitShareBps: number;
  escrowUSDC: bigint;
  usdcSpent: bigint;
  usdcReceived: bigint;
  positionShares: bigint;
  proposedAt: number;
  fundedAt: number;
  tradedAt: number;
  closedAt: number;
  withdrawnAt: number;
  expiresAt: number;
  status: BetStatus;
}

// Off-chain metadata (stored in backend)
export interface BetMetadata {
  chainId: number;
  betId: number;
  slug: string;
  conditionId: string;
  outcomeIndex: number;
  outcomeTokenId: string;
  isYesOutcome: boolean;
  marketQuestion: string;
  marketImage?: string;
  outcomePrice: string;
  createdAt: string;
  updatedAt: string;
}

// Combined view for UI
export interface BetView {
  betId: number;
  bet: BetOnchain;
  metadata?: BetMetadata;
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  active: boolean;
  closed: boolean;
  markets: PolymarketMarket[];
  image: string;
  icon: string;
  volume: number;
  volume_num: number;
  liquidity: number;
  startDate: string;
  start_date: string;
  endDate: string;
  end_date: string;
  createdAt: string;
  created_at: string;
}
