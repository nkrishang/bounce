export type Address = `0x${string}`;

export interface TradeData {
  proposer: Address;
  expirationTimestamp: number;
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  metadataUri: string;
}

export interface TradeEscrowState {
  address: Address;
  buyPerformed: boolean;
  sellPerformed: boolean;
  withdrawFunderPerformed: boolean;
  withdrawProposerPerformed: boolean;
  funder: Address;
  proposerContribution: string;
  funderContribution: string;
  totalSellIn: string;
  buyTokenAmount: string;
  finalSellAmount: string;
  proposerPayout: string;
  funderPayout: string;
}

export type TradeStatus = 'OPEN' | 'FUNDED' | 'SOLD' | 'EXPIRED_UNFUNDED';

export interface TradeView {
  escrow: Address;
  data: TradeData;
  state: TradeEscrowState;
  status: TradeStatus;
  canBuy: boolean;
  canSell: boolean;
  canWithdrawProposer: boolean;
  canWithdrawFunder: boolean;
}

export interface TokenMeta {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

export interface TradeMetadata {
  thesis?: string;
  title?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
