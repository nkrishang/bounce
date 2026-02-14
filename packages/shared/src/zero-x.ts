import type { Address } from './types.js';

// 0x Contract Addresses for Polygon
export const ZERO_X_CONTRACTS = {
  // AllowanceHolder - where tokens are approved for spending
  ALLOWANCE_HOLDER: '0x0000000000001fF3684f28c67538d4D072C22734' as Address,
  // Note: Settler address is returned dynamically in quote response as transaction.to
} as const;

// Polygon chain ID
export const POLYGON_CHAIN_ID = 137;

// 0x API base URL
export const ZERO_X_API_URL = 'https://api.0x.org';

// Types for 0x API responses
export interface ZeroXQuoteRequest {
  chainId: number;
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  taker: Address;
  slippageBps?: number;
}

export interface ZeroXPriceResponse {
  blockNumber: string;
  buyAmount: string;
  buyToken: Address;
  sellAmount: string;
  sellToken: Address;
  gas: string;
  gasPrice: string;
  liquidityAvailable: boolean;
  minBuyAmount: string;
  route: {
    fills: Array<{
      from: Address;
      to: Address;
      source: string;
      proportionBps: string;
    }>;
    tokens: Array<{
      address: Address;
      symbol: string;
    }>;
  };
  issues?: {
    allowance?: {
      actual: string;
      spender: Address;
    };
    balance?: {
      token: Address;
      actual: string;
      expected: string;
    };
    simulationIncomplete?: boolean;
  };
}

export interface ZeroXQuoteResponse extends ZeroXPriceResponse {
  transaction: {
    to: Address;
    data: `0x${string}`;
    value: string;
    gas: string;
    gasPrice: string;
  };
  permit2?: {
    eip712: unknown;
  };
}

// Simplified response for frontend consumption
export interface SwapQuote {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  // For contract execution
  swapTarget: Address;
  swapCallData: `0x${string}`;
  allowanceTarget: Address;
  // Metadata
  gas: string;
  liquidityAvailable: boolean;
  route: {
    fills: Array<{
      from: Address;
      to: Address;
      source: string;
      proportionBps: string;
    }>;
  };
}

export interface SwapQuoteError {
  error: string;
  message: string;
  validationErrors?: Array<{
    field: string;
    reason: string;
  }>;
}
