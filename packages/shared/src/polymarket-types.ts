import type { Address } from './types.js';

export type ProposalStatus =
  | 'PROPOSED'
  | 'FUNDED'
  | 'ORDER_PLACED'
  | 'MATCHED'
  | 'SETTLED';

export interface Proposal {
  id: string;
  proposer: Address;
  funder?: Address;
  safe: Address;
  guard?: Address;
  settlement?: Address;
  totalCapital: string;
  proposerContribution: string;
  conditionId: string;
  outcomeTokenId: string;
  isYesOutcome: boolean;
  marketSlug?: string;
  marketQuestion?: string;
  marketImage?: string;
  outcomePrice?: string;
  metadataUri?: string;
  status: ProposalStatus;
  orderId?: string;
  createdAt: string;
  updatedAt: string;
}

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
