import { FastifyInstance } from 'fastify';
import { type Address } from 'viem';
import {
  getAllTrades,
  getTradeView,
  getUserTrades,
} from '../services/trade.service.js';
import { isValidAddress } from '@escape/shared';
import { logger } from '../lib/logger.js';

export async function tradeRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const { status, userAddress } = request.query as {
      status?: string;
      userAddress?: string;
    };

    try {
      logger.info({ status, userAddress }, 'Fetching trades');
      let trades = await getAllTrades(userAddress as Address | undefined);

      if (status) {
        trades = trades.filter((t) => t.status === status);
      }

      return { data: trades };
    } catch (error) {
      logger.error(error, 'Failed to fetch trades');
      reply.status(500).send({ error: 'Failed to fetch trades' });
    }
  });

  fastify.get<{ Params: { escrow: string } }>('/:escrow', async (request, reply) => {
    const { escrow } = request.params;
    const { userAddress } = request.query as { userAddress?: string };

    if (!isValidAddress(escrow)) {
      return reply.status(400).send({ error: 'Invalid escrow address' });
    }

    try {
      logger.info({ escrow }, 'Fetching trade details');
      const trade = await getTradeView(escrow as Address, userAddress as Address | undefined);
      return { data: trade };
    } catch (error) {
      logger.error({ escrow, error }, 'Failed to fetch trade');
      reply.status(500).send({ error: 'Failed to fetch trade' });
    }
  });

  fastify.get<{ Params: { address: string } }>('/user/:address', async (request, reply) => {
    const { address } = request.params;

    if (!isValidAddress(address)) {
      return reply.status(400).send({ error: 'Invalid user address' });
    }

    try {
      logger.info({ address }, 'Fetching user trades');
      const trades = await getUserTrades(address as Address);
      return { data: trades };
    } catch (error) {
      logger.error({ address, error }, 'Failed to fetch user trades');
      reply.status(500).send({ error: 'Failed to fetch user trades' });
    }
  });
}
