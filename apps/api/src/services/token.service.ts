import { type Address } from 'viem';
import { publicClient } from '../lib/viem.js';
import { ERC20Abi } from '@thesis/contracts';
import { type TokenMeta } from '@thesis/shared';
import { cache } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

const TOKEN_CACHE_PREFIX = 'token-meta-';

export async function getTokenMeta(tokenAddress: Address): Promise<TokenMeta> {
  const cacheKey = `${TOKEN_CACHE_PREFIX}${tokenAddress}`;
  const cached = cache.get<TokenMeta>(cacheKey);
  if (cached) return cached;

  logger.debug({ tokenAddress }, 'Fetching token metadata');

  try {
    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: 'name',
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: 'symbol',
      }),
      publicClient.readContract({
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

    cache.set(cacheKey, meta);
    logger.debug({ tokenAddress, symbol }, 'Fetched token metadata');
    return meta;
  } catch (error) {
    logger.error({ tokenAddress, error }, 'Failed to fetch token metadata');
    throw error;
  }
}

export async function getTokenBalance(
  tokenAddress: Address,
  accountAddress: Address
): Promise<string> {
  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20Abi,
      functionName: 'balanceOf',
      args: [accountAddress],
    });
    return (balance as bigint).toString();
  } catch (error) {
    logger.error({ tokenAddress, accountAddress, error }, 'Failed to fetch token balance');
    throw error;
  }
}
