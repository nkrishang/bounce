import { type Address } from 'viem';
import { getPublicClient, getFactoryAddress } from '../lib/viem.js';
import { TradeEscrowFactoryAbi, TradeEscrowAbi, SUPPORTED_CHAIN_IDS, type ChainId } from '@thesis/contracts';
import {
  type TradeData,
  type TradeEscrowState,
  type TradeView,
  deriveTradeView,
  ZERO_ADDRESS,
} from '@thesis/shared';
import { cache, TTL } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

const ESCROW_STATE_FNS = [
  'buyPerformed',
  'sellPerformed',
  'withdrawFunderPerformed',
  'withdrawProposerPerformed',
  'funder',
  'proposerContribution',
  'funderContribution',
  'totalSellIn',
  'buyTokenAmount',
  'finalSellAmount',
  'proposerPayout',
  'funderPayout',
] as const;

const CALLS_PER_BATCH = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function getAllTradeEscrows(chainId: ChainId): Promise<Address[]> {
  const cacheKey = `all-escrows-${chainId}`;

  return cache.getOrFetch(cacheKey, async () => {
    logger.info({ chainId }, 'Fetching all trade escrows from factory');

    try {
      const factoryAddress = getFactoryAddress(chainId);
      const client = getPublicClient(chainId);
      const escrows = await client.readContract({
        address: factoryAddress,
        abi: TradeEscrowFactoryAbi,
        functionName: 'getAllTradeEscrows',
      });

      const filtered = (escrows as Address[]).filter(
        (addr) => addr.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
      );

      logger.info({ chainId, count: filtered.length }, 'Fetched trade escrows');
      return filtered;
    } catch (error) {
      logger.error({ chainId, error }, 'Failed to fetch trade escrows');
      throw error;
    }
  }, TTL.ESCROW_LIST);
}

export async function getTradeData(chainId: ChainId, escrowAddress: Address): Promise<TradeData> {
  const cacheKey = `trade-data-${chainId}-${escrowAddress}`;
  const cached = await cache.get<TradeData>(cacheKey);
  if (cached) return cached;

  logger.debug({ chainId, escrowAddress }, 'Fetching trade data');

  try {
    const factoryAddress = getFactoryAddress(chainId);
    const client = getPublicClient(chainId);
    const data = await client.readContract({
      address: factoryAddress,
      abi: TradeEscrowFactoryAbi,
      functionName: 'getTradeEscrowData',
      args: [escrowAddress],
    });

    const tradeData: TradeData = {
      proposer: data.proposer as Address,
      expirationTimestamp: Number(data.expirationTimestamp),
      sellToken: data.sellToken as Address,
      buyToken: data.buyToken as Address,
      sellAmount: data.sellAmount.toString(),
      metadataUri: data.metadataUri,
    };

    await cache.set(cacheKey, tradeData, TTL.IMMUTABLE);
    return tradeData;
  } catch (error) {
    logger.error({ chainId, escrowAddress, error }, 'Failed to fetch trade data');
    throw error;
  }
}

export async function getEscrowState(chainId: ChainId, escrowAddress: Address): Promise<TradeEscrowState> {
  const cacheKey = `escrow-state-${chainId}-${escrowAddress}`;
  const cached = await cache.get<TradeEscrowState>(cacheKey);
  if (cached) return cached;

  logger.debug({ chainId, escrowAddress }, 'Fetching escrow state via multicall');

  try {
    const client = getPublicClient(chainId);
    const contracts = ESCROW_STATE_FNS.map((functionName) => ({
      address: escrowAddress,
      abi: TradeEscrowAbi,
      functionName,
    }));

    const results = await client.multicall({
      contracts,
      allowFailure: false,
    });

    const [
      buyPerformed,
      sellPerformed,
      withdrawFunderPerformed,
      withdrawProposerPerformed,
      funder,
      proposerContribution,
      funderContribution,
      totalSellIn,
      buyTokenAmount,
      finalSellAmount,
      proposerPayout,
      funderPayout,
    ] = results;

    const state: TradeEscrowState = {
      address: escrowAddress,
      buyPerformed: buyPerformed as boolean,
      sellPerformed: sellPerformed as boolean,
      withdrawFunderPerformed: withdrawFunderPerformed as boolean,
      withdrawProposerPerformed: withdrawProposerPerformed as boolean,
      funder: funder as Address,
      proposerContribution: (proposerContribution as bigint).toString(),
      funderContribution: (funderContribution as bigint).toString(),
      totalSellIn: (totalSellIn as bigint).toString(),
      buyTokenAmount: (buyTokenAmount as bigint).toString(),
      finalSellAmount: (finalSellAmount as bigint).toString(),
      proposerPayout: (proposerPayout as bigint).toString(),
      funderPayout: (funderPayout as bigint).toString(),
    };

    await cache.set(cacheKey, state, TTL.ESCROW_STATE);
    return state;
  } catch (error) {
    logger.error({ chainId, escrowAddress, error }, 'Failed to fetch escrow state');
    throw error;
  }
}

async function getMultipleTradeDatas(chainId: ChainId, escrows: Address[]): Promise<Map<Address, TradeData>> {
  const factoryAddress = getFactoryAddress(chainId);
  const client = getPublicClient(chainId);
  const map = new Map<Address, TradeData>();

  // Batch cache read — single MGET round-trip instead of N sequential GETs
  const cacheKeys = escrows.map((e) => `trade-data-${chainId}-${e}`);
  const cached = await cache.mget<TradeData>(cacheKeys);

  const uncachedEscrows: Address[] = [];
  for (let i = 0; i < escrows.length; i++) {
    const escrow = escrows[i]!;
    const hit = cached.get(cacheKeys[i]!);
    if (hit) {
      map.set(escrow, hit);
    } else {
      uncachedEscrows.push(escrow);
    }
  }

  if (uncachedEscrows.length === 0) {
    return map;
  }

  logger.debug({ chainId, count: uncachedEscrows.length }, 'Fetching multiple trade datas via multicall');

  const contracts = uncachedEscrows.map((escrow) => ({
    address: factoryAddress,
    abi: TradeEscrowFactoryAbi,
    functionName: 'getTradeEscrowData' as const,
    args: [escrow] as const,
  }));

  const batches = chunk(contracts, CALLS_PER_BATCH);
  const allResults: Array<{
    proposer: Address;
    expirationTimestamp: bigint;
    sellToken: Address;
    buyToken: Address;
    sellAmount: bigint;
    metadataUri: string;
  }> = [];

  for (const batch of batches) {
    const results = await client.multicall({
      contracts: batch,
      allowFailure: false,
    });
    allResults.push(...results);
  }

  // Batch cache write — single pipeline round-trip instead of N sequential SETs
  const cacheEntries: Array<{ key: string; data: TradeData; ttlSeconds: number }> = [];

  for (let i = 0; i < uncachedEscrows.length; i++) {
    const escrow = uncachedEscrows[i]!;
    const data = allResults[i]!;

    const tradeData: TradeData = {
      proposer: data.proposer,
      expirationTimestamp: Number(data.expirationTimestamp),
      sellToken: data.sellToken,
      buyToken: data.buyToken,
      sellAmount: data.sellAmount.toString(),
      metadataUri: data.metadataUri,
    };

    map.set(escrow, tradeData);
    cacheEntries.push({
      key: `trade-data-${chainId}-${escrow}`,
      data: tradeData,
      ttlSeconds: TTL.IMMUTABLE,
    });
  }

  await cache.mset(cacheEntries);
  return map;
}

async function getMultipleEscrowStates(chainId: ChainId, escrows: Address[]): Promise<Map<Address, TradeEscrowState>> {
  const client = getPublicClient(chainId);
  const map = new Map<Address, TradeEscrowState>();

  // Batch cache read — single MGET round-trip instead of N sequential GETs
  const cacheKeys = escrows.map((e) => `escrow-state-${chainId}-${e}`);
  const cached = await cache.mget<TradeEscrowState>(cacheKeys);

  const uncachedEscrows: Address[] = [];
  for (let i = 0; i < escrows.length; i++) {
    const escrow = escrows[i]!;
    const hit = cached.get(cacheKeys[i]!);
    if (hit) {
      map.set(escrow, hit);
    } else {
      uncachedEscrows.push(escrow);
    }
  }

  if (uncachedEscrows.length === 0) {
    return map;
  }

  logger.debug({ chainId, count: uncachedEscrows.length }, 'Fetching multiple escrow states via multicall');

  const calls = uncachedEscrows.flatMap((escrow) =>
    ESCROW_STATE_FNS.map((functionName) => ({
      address: escrow,
      abi: TradeEscrowAbi,
      functionName,
    }))
  );

  const batches = chunk(calls, CALLS_PER_BATCH);
  const allResults: unknown[] = [];

  for (const batch of batches) {
    const results = await client.multicall({
      contracts: batch,
      allowFailure: false,
    });
    allResults.push(...results);
  }

  // Batch cache write — single pipeline round-trip instead of N sequential SETs
  const cacheEntries: Array<{ key: string; data: TradeEscrowState; ttlSeconds: number }> = [];

  for (let i = 0; i < uncachedEscrows.length; i++) {
    const escrow = uncachedEscrows[i]!;
    const base = i * ESCROW_STATE_FNS.length;

    const state: TradeEscrowState = {
      address: escrow,
      buyPerformed: allResults[base + 0] as boolean,
      sellPerformed: allResults[base + 1] as boolean,
      withdrawFunderPerformed: allResults[base + 2] as boolean,
      withdrawProposerPerformed: allResults[base + 3] as boolean,
      funder: allResults[base + 4] as Address,
      proposerContribution: (allResults[base + 5] as bigint).toString(),
      funderContribution: (allResults[base + 6] as bigint).toString(),
      totalSellIn: (allResults[base + 7] as bigint).toString(),
      buyTokenAmount: (allResults[base + 8] as bigint).toString(),
      finalSellAmount: (allResults[base + 9] as bigint).toString(),
      proposerPayout: (allResults[base + 10] as bigint).toString(),
      funderPayout: (allResults[base + 11] as bigint).toString(),
    };

    map.set(escrow, state);
    cacheEntries.push({
      key: `escrow-state-${chainId}-${escrow}`,
      data: state,
      ttlSeconds: TTL.ESCROW_STATE,
    });
  }

  await cache.mset(cacheEntries);
  return map;
}

async function getMultipleTradeViews(
  chainId: ChainId,
  escrows: Address[],
  userAddress?: Address
): Promise<TradeView[]> {
  const [dataByEscrow, stateByEscrow] = await Promise.all([
    getMultipleTradeDatas(chainId, escrows),
    getMultipleEscrowStates(chainId, escrows),
  ]);

  const nowSeconds = Math.floor(Date.now() / 1000);

  return escrows.map((escrow) => {
    const data = dataByEscrow.get(escrow);
    const state = stateByEscrow.get(escrow);
    if (!data || !state) {
      throw new Error(`Missing trade info for escrow ${escrow}`);
    }
    return deriveTradeView(chainId, escrow, data, state, nowSeconds, userAddress);
  });
}

export async function getTradeView(
  chainId: ChainId,
  escrowAddress: Address,
  userAddress?: Address
): Promise<TradeView> {
  const [data, state] = await Promise.all([
    getTradeData(chainId, escrowAddress),
    getEscrowState(chainId, escrowAddress),
  ]);

  const nowSeconds = Math.floor(Date.now() / 1000);
  return deriveTradeView(chainId, escrowAddress, data, state, nowSeconds, userAddress);
}

export async function getAllTrades(userAddress?: Address): Promise<TradeView[]> {
  const chainIds: ChainId[] = [...SUPPORTED_CHAIN_IDS];

  const perChainTrades = await Promise.all(
    chainIds.map(async (chainId) => {
      try {
        const escrows = await getAllTradeEscrows(chainId);
        if (escrows.length === 0) return [];
        return getMultipleTradeViews(chainId, escrows, userAddress);
      } catch (error) {
        logger.error({ chainId, error }, 'Failed to fetch trades for chain');
        return [];
      }
    })
  );

  return perChainTrades.flat();
}

export async function invalidateTradeCache(chainId: ChainId, escrowAddress?: Address): Promise<void> {
  await cache.invalidate(`all-escrows-${chainId}`);
  if (escrowAddress) {
    await cache.invalidate(`escrow-state-${chainId}-${escrowAddress}`);
  }
  logger.info({ chainId, escrowAddress }, 'Trade cache invalidated');
}

export async function getUserTrades(userAddress: Address): Promise<{
  asProposer: TradeView[];
  asFunder: TradeView[];
}> {
  const trades = await getAllTrades(userAddress);

  const asProposer = trades.filter(
    (t) => t.data.proposer.toLowerCase() === userAddress.toLowerCase()
  );

  const asFunder = trades.filter(
    (t) =>
      t.state.funder.toLowerCase() === userAddress.toLowerCase() &&
      t.state.funder.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
  );

  return { asProposer, asFunder };
}
