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
  Prepared = 3,
  Traded = 4,
  Closed = 5,
  Cancelled = 6,
  Withdrawn = 7,
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
  inFlightUSDC: bigint;
  preparedAt: number;
}

// Off-chain metadata (stored in backend)
export interface BetMetadata {
  bounceAddress: string;
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

// Off-chain trade execution state (from backend)
export interface BetTradeState {
  betId: number;
  flow?: 'open' | 'close';
  prepareStatus: 'pending' | 'confirmed' | 'failed';
  prepareTxHash?: string;
  orderId?: string;
  clobStatus?: 'MATCHED' | 'MINED' | 'CONFIRMED' | 'RETRYING' | 'FAILED' | 'CANCELED';
  finalizeStatus?: 'pending' | 'confirmed' | 'failed';
  finalizeTxHash?: string;
  fillPrice?: string;
  fillAmount?: string;
  lastError?: string;
  updatedAt: string;
}

/**
 * Normalizes raw viem getBet() output (all-bigint) into BetOnchain with correct JS types.
 * Viem decodes uint8/16/40 as bigint; this converts the small fields to number.
 */
export function normalizeBet(raw: Record<string, unknown>): BetOnchain {
  return {
    safe: raw.safe as BetOnchain['safe'],
    proposer: raw.proposer as BetOnchain['proposer'],
    funder: raw.funder as BetOnchain['funder'],
    exchange: raw.exchange as BetOnchain['exchange'],
    conditionId: raw.conditionId as BetOnchain['conditionId'],
    outcomeIndex: Number(raw.outcomeIndex),
    indexSet: raw.indexSet as bigint,
    positionId: raw.positionId as bigint,
    slugHash: raw.slugHash as BetOnchain['slugHash'],
    totalCapital: raw.totalCapital as bigint,
    proposerCapitalBps: Number(raw.proposerCapitalBps),
    proposerProfitShareBps: Number(raw.proposerProfitShareBps),
    escrowUSDC: raw.escrowUSDC as bigint,
    usdcSpent: raw.usdcSpent as bigint,
    usdcReceived: raw.usdcReceived as bigint,
    positionShares: raw.positionShares as bigint,
    proposedAt: Number(raw.proposedAt),
    fundedAt: Number(raw.fundedAt),
    tradedAt: Number(raw.tradedAt),
    closedAt: Number(raw.closedAt),
    withdrawnAt: Number(raw.withdrawnAt),
    expiresAt: Number(raw.expiresAt),
    status: Number(raw.status) as BetStatus,
    inFlightUSDC: raw.inFlightUSDC as bigint,
    preparedAt: Number(raw.preparedAt),
  };
}

/**
 * Validates a conditionId is a proper 32-byte hex string.
 * Returns the validated hex string with 0x prefix.
 */
export function validateConditionId(conditionId: string): `0x${string}` {
  const hex = conditionId.startsWith('0x') ? conditionId : `0x${conditionId}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error(`Invalid conditionId: must be 32 bytes (66 hex chars with 0x prefix), got "${conditionId}"`);
  }
  return hex as `0x${string}`;
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
