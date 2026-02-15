import { FastifyInstance } from 'fastify';
import { type Address } from 'viem';
import { type ChainId } from '@thesis/contracts';
import { getTokenMeta, getTokenBalance } from '../services/token.service.js';
import { getTrendingTokens } from '../services/trending.service.js';
import { isValidAddress } from '@thesis/shared';
import { logger } from '../lib/logger.js';

export async function tokenRoutes(fastify: FastifyInstance) {
  // Must be registered before /:address to avoid param collision
  fastify.get('/trending', async (_request, reply) => {
    try {
      const tokens = await getTrendingTokens();
      return { data: tokens };
    } catch (error) {
      logger.error({ error }, 'Failed to fetch trending tokens');
      reply.status(500).send({ error: 'Failed to fetch trending tokens' });
    }
  });

  fastify.get<{ Params: { address: string } }>('/:address', async (request, reply) => {
    const { address } = request.params;
    const { chainId } = request.query as { chainId?: string };

    if (!isValidAddress(address)) {
      return reply.status(400).send({ error: 'Invalid token address' });
    }

    if (!chainId) {
      return reply.status(400).send({ error: 'chainId query parameter is required' });
    }

    try {
      logger.info({ address, chainId }, 'Fetching token metadata');
      const meta = await getTokenMeta(Number(chainId) as ChainId, address as Address);
      return { data: meta };
    } catch (error) {
      logger.error({ address, error }, 'Failed to fetch token metadata');
      reply.status(500).send({ error: 'Failed to fetch token metadata' });
    }
  });

  fastify.get<{ Params: { tokenAddress: string; accountAddress: string } }>(
    '/:tokenAddress/balance/:accountAddress',
    async (request, reply) => {
      const { tokenAddress, accountAddress } = request.params;
      const { chainId } = request.query as { chainId?: string };

      if (!isValidAddress(tokenAddress)) {
        return reply.status(400).send({ error: 'Invalid token address' });
      }
      if (!isValidAddress(accountAddress)) {
        return reply.status(400).send({ error: 'Invalid account address' });
      }

      if (!chainId) {
        return reply.status(400).send({ error: 'chainId query parameter is required' });
      }

      try {
        logger.info({ tokenAddress, accountAddress, chainId }, 'Fetching token balance');
        const balance = await getTokenBalance(
          Number(chainId) as ChainId,
          tokenAddress as Address,
          accountAddress as Address
        );
        return { data: { balance } };
      } catch (error) {
        logger.error({ tokenAddress, accountAddress, error }, 'Failed to fetch token balance');
        reply.status(500).send({ error: 'Failed to fetch token balance' });
      }
    }
  );
}
