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

// ClobAuth EIP-712 types for L1 credential derivation
export const CLOB_AUTH_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: 137,
} as const;

export const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const;

const CLOB_AUTH_MESSAGE = 'This message attests that I control the given wallet';

export async function signClobAuth(
  walletClient: WalletClient,
  address: Address,
): Promise<{ signature: `0x${string}`; timestamp: number; nonce: number }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 0;

  const signature = await walletClient.signTypedData({
    account: address,
    domain: CLOB_AUTH_DOMAIN,
    types: CLOB_AUTH_TYPES,
    primaryType: 'ClobAuth',
    message: {
      address,
      timestamp: `${timestamp}`,
      nonce: BigInt(nonce),
      message: CLOB_AUTH_MESSAGE,
    },
  });

  return { signature, timestamp, nonce };
}

// Order EIP-712 types for Polymarket CTF Exchange
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
  // Must fit in a JS safe integer for Polymarket's orderToJson (parseInt roundtrip)
  const bytes = new Uint8Array(7); // 56 bits > 53-bit safe integer range
  crypto.getRandomValues(bytes);
  // Mask to 53 bits to stay within Number.MAX_SAFE_INTEGER
  bytes[0] = bytes[0] & 0x1f; // keep only lower 5 bits of first byte
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
  // Round price to tick size (0.01) — Polymarket rejects finer granularity
  const roundedPrice = Math.round(params.price * 100) / 100;
  const priceMicro = BigInt(Math.round(roundedPrice * 1_000_000));

  // Polymarket BUY order: takerAmount (size) is primary, makerAmount = price × size.
  // Precision rules (raw 6-decimal token units):
  //   takerAmount (shares): max 2 human decimals → raw divisible by 10_000
  //   makerAmount (USDC):   max 4 human decimals → raw divisible by 100

  // 1) Compute size from USDC budget, round DOWN to 2 decimals
  const rawSize = priceMicro > 0n
    ? (params.usdcAmount * 1_000_000n) / priceMicro
    : 0n;
  const takerAmount = (rawSize / 10_000n) * 10_000n;

  // 2) Derive makerAmount = price × size, round DOWN to 4 decimals
  let makerAmount = (takerAmount * priceMicro) / 1_000_000n;
  makerAmount = (makerAmount / 100n) * 100n;

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
  const [account] = await walletClient.getAddresses();
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
