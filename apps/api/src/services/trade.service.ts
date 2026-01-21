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

  logger.debug({ escrowAddress }, 'Fetching escrow state');

  try {
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
    ] = await Promise.all([
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'buyPerformed',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'sellPerformed',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'withdrawFunderPerformed',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'withdrawProposerPerformed',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'funder',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'proposerContribution',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'funderContribution',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'totalSellIn',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'buyTokenAmount',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'finalSellAmount',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'proposerPayout',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: TradeEscrowAbi,
        functionName: 'funderPayout',
      }),
    ]);

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

export async function getTradeView(escrowAddress: Address, userAddress?: Address): Promise<TradeView> {
  const [data, state] = await Promise.all([
    getTradeData(escrowAddress),
    getEscrowState(escrowAddress),
  ]);

  const nowSeconds = Math.floor(Date.now() / 1000);
  return deriveTradeView(escrowAddress, data, state, nowSeconds, userAddress);
}

export async function getAllTrades(userAddress?: Address): Promise<TradeView[]> {
  const escrows = await getAllTradeEscrows();
  const trades = await Promise.all(
    escrows.map((escrow) => getTradeView(escrow, userAddress))
  );
  return trades;
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
    (t) => t.state.funder.toLowerCase() === userAddress.toLowerCase() &&
           t.state.funder.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
  );

  return { asProposer, asFunder };
}
