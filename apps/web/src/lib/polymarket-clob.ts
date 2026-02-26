import type { Address, WalletClient } from 'viem';

export interface Order {
  salt: bigint;
  maker: Address;
  signer: Address;
  taker: Address;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: number;
  signatureType: number;
}

export const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const;

export function getExchangeDomain(exchangeAddress: Address) {
  return {
    name: 'Polymarket CTF Exchange',
    version: '1',
    chainId: 137,
    verifyingContract: exchangeAddress,
  } as const;
}

export function generateSalt(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''));
}

export function buildBuyOrder(params: {
  safe: Address;
  signer: Address;
  tokenId: string;
  usdcAmount: bigint;
  price: number;
  nonce: bigint;
  expiration: number;
  exchange: Address;
}): Order {
  // BUY: maker pays USDC (makerAmount), receives tokens (takerAmount)
  // makerAmount = USDC to spend
  // takerAmount = shares to receive = usdcAmount / price
  // price is in the range (0, 1), e.g. 0.50 means 50 cents per share
  // Use integer math to avoid floating point precision issues
  const makerAmount = params.usdcAmount;
  const priceMicro = BigInt(Math.round(params.price * 1_000_000));
  const takerAmount = priceMicro > 0n
    ? (params.usdcAmount * 1_000_000n) / priceMicro
    : 0n;

  return {
    salt: generateSalt(),
    maker: params.safe,
    signer: params.signer,
    taker: '0x0000000000000000000000000000000000000000' as Address,
    tokenId: BigInt(params.tokenId),
    makerAmount,
    takerAmount,
    expiration: BigInt(params.expiration || 0),
    nonce: params.nonce,
    feeRateBps: 0n,
    side: 0, // BUY
    signatureType: 2, // POLY_GNOSIS_SAFE
  };
}

export async function signOrder(
  walletClient: WalletClient,
  order: Order,
  exchangeAddress: Address,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error('No account on wallet client');

  const domain = getExchangeDomain(exchangeAddress);

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: ORDER_TYPES,
    primaryType: 'Order',
    message: {
      salt: order.salt,
      maker: order.maker,
      signer: order.signer,
      taker: order.taker,
      tokenId: order.tokenId,
      makerAmount: order.makerAmount,
      takerAmount: order.takerAmount,
      expiration: order.expiration,
      nonce: order.nonce,
      feeRateBps: order.feeRateBps,
      side: order.side,
      signatureType: order.signatureType,
    },
  });

  return signature;
}
