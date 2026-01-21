import { FastifyInstance } from 'fastify';
import { type Address } from 'viem';
import { getTokenMeta, getTokenBalance } from '../services/token.service.js';
import { isValidAddress } from '@escape/shared';
import { logger } from '../lib/logger.js';

export async function tokenRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { address: string } }>('/:address', async (request, reply) => {
    const { address } = request.params;

    if (!isValidAddress(address)) {
      return reply.status(400).send({ error: 'Invalid token address' });
    }

    try {
      logger.info({ address }, 'Fetching token metadata');
      const meta = await getTokenMeta(address as Address);
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

      if (!isValidAddress(tokenAddress)) {
        return reply.status(400).send({ error: 'Invalid token address' });
      }
      if (!isValidAddress(accountAddress)) {
        return reply.status(400).send({ error: 'Invalid account address' });
      }

      try {
        logger.info({ tokenAddress, accountAddress }, 'Fetching token balance');
        const balance = await getTokenBalance(
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
