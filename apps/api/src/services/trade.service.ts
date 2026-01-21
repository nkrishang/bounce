import { type Address } from 'viem';
import { publicClient, getFactoryAddress } from '../lib/viem.js';
import { TradeEscrowFactoryAbi, TradeEscrowAbi } from '@escape/contracts';
import {
  type TradeData,
  type TradeEscrowState,
  type TradeView,
  deriveTradeView,
  ZERO_ADDRESS,
} from '@escape/shared';
import { cache } from '../lib/cache.js';
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

export async function getAllTradeEscrows(): Promise<Address[]> {
  const cacheKey = 'all-escrows';
  const cached = cache.get<Address[]>(cacheKey);
  if (cached) return cached;

  logger.info('Fetching all trade escrows from factory');

  try {
    const factoryAddress = getFactoryAddress();
    const escrows = await publicClient.readContract({
      address: factoryAddress,
      abi: TradeEscrowFactoryAbi,
      functionName: 'getAllTradeEscrows',
    });

    const filtered = (escrows as Address[]).filter(
      (addr) => addr.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
    );

    cache.set(cacheKey, filtered);
    logger.info({ count: filtered.length }, 'Fetched trade escrows');
    return filtered;
  } catch (error) {
    logger.error(error, 'Failed to fetch trade escrows');
    throw error;
  }
}

export async function getTradeData(escrowAddress: Address): Promise<TradeData> {
  const cacheKey = `trade-data-${escrowAddress}`;
  const cached = cache.get<TradeData>(cacheKey);
  if (cached) return cached;

  logger.debug({ escrowAddress }, 'Fetching trade data');

  try {
    const factoryAddress = getFactoryAddress();
    const data = await publicClient.readContract({
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

    cache.set(cacheKey, tradeData);
    return tradeData;
  } catch (error) {
    logger.error({ escrowAddress, error }, 'Failed to fetch trade data');
    throw error;
  }
}

export async function getEscrowState(escrowAddress: Address): Promise<TradeEscrowState> {
  const cacheKey = `escrow-state-${escrowAddress}`;
  const cached = cache.get<TradeEscrowState>(cacheKey);
  if (cached) return cached;

  logger.debug({ escrowAddress }, 'Fetching escrow state via multicall');

  try {
    const contracts = ESCROW_STATE_FNS.map((functionName) => ({
      address: escrowAddress,
      abi: TradeEscrowAbi,
      functionName,
    }));

    const results = await publicClient.multicall({
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

    cache.set(cacheKey, state);
    return state;
  } catch (error) {
    logger.error({ escrowAddress, error }, 'Failed to fetch escrow state');
    throw error;
  }
}

async function getMultipleTradeDatas(escrows: Address[]): Promise<Map<Address, TradeData>> {
  const factoryAddress = getFactoryAddress();
  const map = new Map<Address, TradeData>();

  const uncachedEscrows: Address[] = [];
  for (const escrow of escrows) {
    const cached = cache.get<TradeData>(`trade-data-${escrow}`);
    if (cached) {
      map.set(escrow, cached);
    } else {
      uncachedEscrows.push(escrow);
    }
  }

  if (uncachedEscrows.length === 0) {
    return map;
  }

  logger.debug({ count: uncachedEscrows.length }, 'Fetching multiple trade datas via multicall');

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
    const results = await publicClient.multicall({
      contracts: batch,
      allowFailure: false,
    });
    allResults.push(...results);
  }

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
    cache.set(`trade-data-${escrow}`, tradeData);
  }

  return map;
}

async function getMultipleEscrowStates(escrows: Address[]): Promise<Map<Address, TradeEscrowState>> {
  const map = new Map<Address, TradeEscrowState>();

  const uncachedEscrows: Address[] = [];
  for (const escrow of escrows) {
    const cached = cache.get<TradeEscrowState>(`escrow-state-${escrow}`);
    if (cached) {
      map.set(escrow, cached);
    } else {
      uncachedEscrows.push(escrow);
    }
  }

  if (uncachedEscrows.length === 0) {
    return map;
  }

  logger.debug({ count: uncachedEscrows.length }, 'Fetching multiple escrow states via multicall');

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
    const results = await publicClient.multicall({
      contracts: batch,
      allowFailure: false,
    });
    allResults.push(...results);
  }

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
    cache.set(`escrow-state-${escrow}`, state);
  }

  return map;
}

async function getMultipleTradeViews(
  escrows: Address[],
  userAddress?: Address
): Promise<TradeView[]> {
  const [dataByEscrow, stateByEscrow] = await Promise.all([
    getMultipleTradeDatas(escrows),
    getMultipleEscrowStates(escrows),
  ]);

  const nowSeconds = Math.floor(Date.now() / 1000);

  return escrows.map((escrow) => {
    const data = dataByEscrow.get(escrow);
    const state = stateByEscrow.get(escrow);
    if (!data || !state) {
      throw new Error(`Missing trade info for escrow ${escrow}`);
    }
    return deriveTradeView(escrow, data, state, nowSeconds, userAddress);
  });
}

export async function getTradeView(
  escrowAddress: Address,
  userAddress?: Address
): Promise<TradeView> {
  const [data, state] = await Promise.all([
    getTradeData(escrowAddress),
    getEscrowState(escrowAddress),
  ]);

  const nowSeconds = Math.floor(Date.now() / 1000);
  return deriveTradeView(escrowAddress, data, state, nowSeconds, userAddress);
}

export async function getAllTrades(userAddress?: Address): Promise<TradeView[]> {
  const escrows = await getAllTradeEscrows();
  
  if (escrows.length === 0) {
    return [];
  }

  logger.info({ count: escrows.length }, 'Fetching all trades via multicall');
  return getMultipleTradeViews(escrows, userAddress);
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
