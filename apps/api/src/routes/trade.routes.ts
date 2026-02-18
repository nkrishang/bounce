import { FastifyInstance } from 'fastify';
import { type Address } from 'viem';
import { SUPPORTED_CHAIN_IDS, type ChainId } from '@bounce/contracts';
import {
  getAllTrades,
  getTradeView,
  getUserTrades,
  invalidateTradeCache,
  TradeNotFoundError,
} from '../services/trade.service.js';
import { isValidAddress } from '@bounce/shared';
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

  fastify.post('/refresh', async (request, reply) => {
    const { chainId, escrowAddress } = request.body as {
      chainId?: number;
      escrowAddress?: string;
    };

    if (!chainId || !SUPPORTED_CHAIN_IDS.includes(chainId as any)) {
      return reply.status(400).send({
        error: 'Invalid or missing chainId',
        message: `chainId must be one of: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
      });
    }

    if (escrowAddress && !isValidAddress(escrowAddress)) {
      return reply.status(400).send({ error: 'Invalid escrow address' });
    }

    try {
      await invalidateTradeCache(chainId as ChainId, escrowAddress as Address | undefined);
      return { success: true };
    } catch (error) {
      logger.error({ chainId, escrowAddress, error }, 'Failed to invalidate trade cache');
      reply.status(500).send({ error: 'Failed to refresh' });
    }
  });

  fastify.get<{ Params: { escrow: string } }>('/:escrow', async (request, reply) => {
    const { escrow } = request.params;
    const { userAddress, chainId } = request.query as { userAddress?: string; chainId?: string };

    if (!isValidAddress(escrow)) {
      return reply.status(400).send({ error: 'Invalid escrow address' });
    }

    if (!chainId) {
      return reply.status(400).send({ error: 'chainId query parameter is required' });
    }

    try {
      logger.info({ escrow, chainId }, 'Fetching trade details');
      const trade = await getTradeView(Number(chainId) as ChainId, escrow as Address, userAddress as Address | undefined);
      return { data: trade };
    } catch (error) {
      if (error instanceof TradeNotFoundError) {
        return reply.status(404).send({ error: 'Trade not found' });
      }
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
