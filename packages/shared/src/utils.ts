import type { TradeData, TradeEscrowState, TradeStatus, TradeView, Address, SupportedChainId } from './types.js';

export function bigintToString(value: bigint): string {
  return value.toString();
}

export function stringToBigint(value: string): bigint {
  return BigInt(value);
}

export function deriveTradeStatus(
  data: TradeData,
  state: TradeEscrowState,
  nowSeconds: number
): TradeStatus {
  if (state.sellPerformed) {
    return 'SOLD';
  }
  if (state.buyPerformed) {
    return 'FUNDED';
  }
  if (nowSeconds > data.expirationTimestamp) {
    return 'EXPIRED_UNFUNDED';
  }
  return 'OPEN';
}

export function deriveTradeView(
  chainId: SupportedChainId,
  escrow: Address,
  data: TradeData,
  state: TradeEscrowState,
  nowSeconds: number,
  userAddress?: Address
): TradeView {
  const status = deriveTradeStatus(data, state, nowSeconds);
  const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;
  
  const isProposer = userAddress?.toLowerCase() === data.proposer.toLowerCase();
  const isFunder = userAddress?.toLowerCase() === state.funder.toLowerCase() && 
                   state.funder.toLowerCase() !== zeroAddress.toLowerCase();

  const canBuy = status === 'OPEN';
  const canSell = status === 'FUNDED' && (isProposer || isFunder);
  
  const canWithdrawProposer = 
    (status === 'EXPIRED_UNFUNDED' && !state.withdrawProposerPerformed) ||
    (status === 'SOLD' && !state.withdrawProposerPerformed && BigInt(state.proposerPayout) > 0n);
  
  const canWithdrawFunder = 
    status === 'SOLD' && 
    !state.withdrawFunderPerformed && 
    BigInt(state.funderPayout) > 0n;

  return {
    chainId,
    escrow,
    data,
    state,
    status,
    canBuy,
    canSell,
    canWithdrawProposer,
    canWithdrawFunder,
  };
}

export function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function parseMetadataUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

export function calculateFunderContribution(sellAmount: string): string {
  return (BigInt(sellAmount) * 4n).toString();
}

export function calculateTotalPosition(sellAmount: string): string {
  return (BigInt(sellAmount) * 5n).toString();
}

export function calculateProfitLoss(
  totalSellIn: string,
  finalSellAmount: string
): { isProfit: boolean; amount: string; percentage: number } {
  const sellIn = BigInt(totalSellIn);
  const sellOut = BigInt(finalSellAmount);
  
  if (sellOut >= sellIn) {
    const profit = sellOut - sellIn;
    const percentage = sellIn > 0n ? Number((profit * 10000n) / sellIn) / 100 : 0;
    return { isProfit: true, amount: profit.toString(), percentage };
  } else {
    const loss = sellIn - sellOut;
    const percentage = sellIn > 0n ? Number((loss * 10000n) / sellIn) / 100 : 0;
    return { isProfit: false, amount: loss.toString(), percentage };
  }
}
