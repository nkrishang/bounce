import { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';
import {
  getBetMetadata,
  getBetMetadataByCondition,
  getAllBetMetadata,
  saveBetMetadata,
} from '../services/bet.service.js';

export async function betRoutes(fastify: FastifyInstance) {
  // Get metadata for a specific bet
  fastify.get<{ Params: { betId: string } }>('/:betId/metadata', async (request, reply) => {
    const betId = parseInt(request.params.betId, 10);
    if (isNaN(betId)) {
      return reply.status(400).send({ error: 'Invalid betId' });
    }
    const metadata = await getBetMetadata(betId);
    if (!metadata) {
      return reply.status(404).send({ error: 'Bet metadata not found' });
    }
    return { data: metadata };
  });

  // Get all bet metadata for a condition
  fastify.get<{ Params: { conditionId: string } }>('/by-condition/:conditionId', async (request) => {
    const metadata = await getBetMetadataByCondition(request.params.conditionId);
    return { data: metadata };
  });

  // Get all bet metadata
  fastify.get('/', async () => {
    const metadata = await getAllBetMetadata();
    return { data: metadata };
  });

  // Save bet metadata (immutable — rejects if betId already exists)
  fastify.post<{ Params: { betId: string } }>('/:betId/metadata', async (request, reply) => {
    try {
      const betId = parseInt(request.params.betId, 10);
      if (isNaN(betId)) {
        return reply.status(400).send({ error: 'Invalid betId' });
      }

      const body = request.body as any;
      if (!body.conditionId || !body.outcomeTokenId) {
        return reply.status(400).send({
          error: 'Missing required fields: conditionId, outcomeTokenId',
        });
      }

      const existing = await getBetMetadata(betId);
      if (existing) {
        return reply.status(409).send({ error: 'Bet metadata already exists and is immutable' });
      }

      const metadata = await saveBetMetadata({
        chainId: body.chainId || 137,
        betId,
        slug: body.slug || '',
        conditionId: body.conditionId,
        outcomeIndex: body.outcomeIndex ?? 0,
        outcomeTokenId: body.outcomeTokenId,
        isYesOutcome: body.isYesOutcome ?? true,
        marketQuestion: body.marketQuestion || '',
        marketImage: body.marketImage,
        outcomePrice: body.outcomePrice || '0',
      });

      return reply.status(201).send({ data: metadata });
    } catch (error) {
      logger.error(error, 'Failed to save bet metadata');
      return reply.status(500).send({ error: 'Failed to save bet metadata' });
    }
  });
}
