import { type Address } from 'viem';
import { getPublicClient } from '../lib/viem.js';
import { type ChainId } from '@bounce/contracts';
import { ERC20Abi } from '@bounce/contracts';
import { type TokenMeta } from '@bounce/shared';
import { cache, TTL } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

const TOKEN_CACHE_PREFIX = 'token-meta-';

export async function getTokenMeta(chainId: ChainId, tokenAddress: Address): Promise<TokenMeta> {
  const cacheKey = `${TOKEN_CACHE_PREFIX}${chainId}-${tokenAddress}`;
  const cached = await cache.get<TokenMeta>(cacheKey);
  if (cached) return cached;

  logger.debug({ chainId, tokenAddress }, 'Fetching token metadata');

  try {
    const client = getPublicClient(chainId);
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: 'name',
      }),
      client.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: 'symbol',
      }),
      client.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: 'decimals',
      }),
    ]);

    const meta: TokenMeta = {
      address: tokenAddress,
      name: name as string,
      symbol: symbol as string,
      decimals: decimals as number,
    };

    await cache.set(cacheKey, meta, TTL.IMMUTABLE);
    logger.debug({ chainId, tokenAddress, symbol }, 'Fetched token metadata');
    return meta;
  } catch (error) {
    logger.error({ chainId, tokenAddress, error }, 'Failed to fetch token metadata');
    throw error;
  }
}

export async function getTokenBalance(
  chainId: ChainId,
  tokenAddress: Address,
  accountAddress: Address
): Promise<string> {
  try {
    const client = getPublicClient(chainId);
    const balance = await client.readContract({
      address: tokenAddress,
      abi: ERC20Abi,
      functionName: 'balanceOf',
      args: [accountAddress],
    });
    return (balance as bigint).toString();
  } catch (error) {
    logger.error({ chainId, tokenAddress, accountAddress, error }, 'Failed to fetch token balance');
    throw error;
  }
}
