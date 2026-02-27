import { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';
import { verifyPrivyToken } from '../lib/privy.js';
import {
  getBetMetadata,
  getBetMetadataByCondition,
  getAllBetMetadata,
  saveBetMetadata,
} from '../services/bet.service.js';
import { getTradeExecution, upsertTradeExecution } from '../services/trade.service.js';
import { callPrepareTrade, callUnprepareTrade, reconcileBetSettlement } from '../services/trade-orchestrator.js';
import { POLYMARKET_ADDRESSES, BounceAbi } from '@bounce/contracts';
import { normalizeBet, BetStatus } from '@bounce/shared';
import { publicClient } from '../lib/viem.js';
import type { PublicClient } from 'viem';

export async function betRoutes(fastify: FastifyInstance) {
  const bounceAddress = POLYMARKET_ADDRESSES.BOUNCE.toLowerCase();
  // Get metadata for a specific bet
  fastify.get<{ Params: { betId: string } }>('/:betId/metadata', async (request, reply) => {
    const betId = parseInt(request.params.betId, 10);
    if (isNaN(betId)) {
      return reply.status(400).send({ error: 'Invalid betId' });
    }
    const metadata = await getBetMetadata(bounceAddress, betId);
    if (!metadata) {
      return reply.status(404).send({ error: 'Bet metadata not found' });
    }
    return { data: metadata };
  });

  // Get all bet metadata for a condition
  fastify.get<{ Params: { conditionId: string } }>('/by-condition/:conditionId', async (request) => {
    const metadata = await getBetMetadataByCondition(bounceAddress, request.params.conditionId);
    return { data: metadata };
  });

  // Get all bet metadata
  fastify.get('/', async () => {
    const metadata = await getAllBetMetadata(bounceAddress);
    return { data: metadata };
  });

  // Save bet metadata (immutable — rejects if betId already exists)
  // Requires Privy authentication
  fastify.post<{ Params: { betId: string } }>('/:betId/metadata', async (request, reply) => {
    try {
      // Verify Privy access token
      try {
        await verifyPrivyToken(request.headers.authorization);
      } catch (authErr) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

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

      const conditionId = body.conditionId.startsWith('0x') ? body.conditionId : `0x${body.conditionId}`;
      if (!/^0x[a-fA-F0-9]{64}$/.test(conditionId)) {
        return reply.status(400).send({ error: 'Invalid conditionId: must be 32 bytes hex' });
      }

      const existing = await getBetMetadata(bounceAddress, betId);
      if (existing) {
        return reply.status(409).send({ error: 'Bet metadata already exists and is immutable', data: existing });
      }

      const metadata = await saveBetMetadata({
        bounceAddress,
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

  // Get trade execution status for a bet
  fastify.get<{ Params: { betId: string } }>('/:betId/trade-status', async (request, reply) => {
    const betId = parseInt(request.params.betId, 10);
    if (isNaN(betId)) {
      return reply.status(400).send({ error: 'Invalid betId' });
    }

    try {
      const { getTradeExecution } = await import('../services/trade.service.js');
      const execution = await getTradeExecution(bounceAddress, betId);
      if (!execution) {
        return { data: null };
      }

      return {
        data: {
          betId: execution.betId,
          flow: execution.flow,
          prepareStatus: execution.prepareStatus,
          prepareTxHash: execution.prepareTxHash,
          orderId: execution.orderId,
          clobStatus: execution.clobStatus,
          finalizeStatus: execution.finalizeStatus,
          finalizeTxHash: execution.finalizeTxHash,
          fillPrice: execution.fillPrice || null,
          fillAmount: execution.fillAmount || null,
          lastError: execution.lastError,
          updatedAt: execution.updatedAt?.toISOString() || new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error(error, 'Failed to fetch trade status');
      return reply.status(500).send({ error: 'Failed to fetch trade status' });
    }
  });

  // Prepare a funded bet for trading (calls prepareTrade on-chain via backend signer)
  // Requires Privy authentication
  fastify.post<{ Params: { betId: string } }>('/:betId/prepare', async (request, reply) => {
    try {
      try {
        await verifyPrivyToken(request.headers.authorization);
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const betId = parseInt(request.params.betId, 10);
      if (isNaN(betId)) {
        return reply.status(400).send({ error: 'Invalid betId' });
      }

      // Check on-chain state as source of truth
      const raw = await (publicClient as PublicClient).readContract({
        address: POLYMARKET_ADDRESSES.BOUNCE,
        abi: BounceAbi,
        functionName: 'getBet',
        args: [BigInt(betId)],
      });
      const bet = normalizeBet(raw as Record<string, unknown>);
      const existing = await getTradeExecution(bounceAddress, betId);

      // Already Prepared on-chain — idempotent success
      if (bet.status === BetStatus.Prepared) {
        if (existing?.prepareStatus !== 'confirmed') {
          await upsertTradeExecution({ bounceAddress, betId, prepareStatus: 'confirmed' });
        }
        return { data: { txHash: existing?.prepareTxHash ?? null } };
      }

      // Only allow prepare when on-chain says Funded
      if (bet.status !== BetStatus.Funded) {
        return reply.status(409).send({ error: `Bet not in Funded status (current: ${bet.status})` });
      }

      // If DB says pending but chain says Funded, the old prepare failed/was reset — clear it
      if (existing?.prepareStatus === 'pending') {
        await upsertTradeExecution({ bounceAddress, betId, prepareStatus: 'failed', lastError: 'stale pending cleared' });
      }

      const txHash = await callPrepareTrade(betId);
      return { data: { txHash } };
    } catch (error) {
      logger.error(error, 'Failed to prepare trade');
      return reply.status(500).send({ error: 'Failed to prepare trade' });
    }
  });

  // Unprepare a stuck Prepared bet (resets to Funded so it can be re-traded)
  // Requires Privy authentication
  fastify.post<{ Params: { betId: string } }>('/:betId/unprepare', async (request, reply) => {
    try {
      try {
        await verifyPrivyToken(request.headers.authorization);
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const betId = parseInt(request.params.betId, 10);
      if (isNaN(betId)) {
        return reply.status(400).send({ error: 'Invalid betId' });
      }

      const txHash = await callUnprepareTrade(betId);
      return { data: { txHash } };
    } catch (error) {
      logger.error(error, 'Failed to unprepare trade');
      return reply.status(500).send({ error: 'Failed to unprepare trade' });
    }
  });

  // Register a CLOB order ID placed by the frontend (starts backend polling + finalization)
  // Requires Privy authentication
  fastify.post<{ Params: { betId: string } }>('/:betId/register-order', async (request, reply) => {
    try {
      try {
        await verifyPrivyToken(request.headers.authorization);
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const betId = parseInt(request.params.betId, 10);
      if (isNaN(betId)) {
        return reply.status(400).send({ error: 'Invalid betId' });
      }

      const body = request.body as { orderId?: string; flow?: string };
      if (!body.orderId) {
        return reply.status(400).send({ error: 'Missing orderId' });
      }

      const flow = body.flow === 'close' ? 'close' : 'open';

      const { upsertTradeExecution } = await import('../services/trade.service.js');
      await upsertTradeExecution({
        bounceAddress,
        betId,
        orderId: body.orderId,
        clobStatus: 'SUBMITTED',
        flow,
        finalizeStatus: null,
        finalizeTxHash: null,
        lastError: null,
      });

      const { startClobPolling } = await import('../services/clob-poller.js');
      startClobPolling(betId, body.orderId);

      logger.info({ betId, orderId: body.orderId }, 'Registered CLOB order from frontend');
      return { data: { orderId: body.orderId } };
    } catch (error) {
      logger.error(error, 'Failed to register CLOB order');
      return reply.status(500).send({ error: 'Failed to register CLOB order' });
    }
  });

  // Reconcile a stuck bet by checking on-chain state and calling finalizeTrade/closePosition
  // Requires Privy authentication
  fastify.post<{ Params: { betId: string } }>('/:betId/reconcile', async (request, reply) => {
    try {
      try {
        await verifyPrivyToken(request.headers.authorization);
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const betId = parseInt(request.params.betId, 10);
      if (isNaN(betId)) {
        return reply.status(400).send({ error: 'Invalid betId' });
      }

      const result = await reconcileBetSettlement(betId);
      if (result.action) {
        logger.info({ betId, action: result.action, txHash: result.txHash }, 'Reconcile completed');
      }
      return { data: result };
    } catch (error) {
      logger.error(error, 'Failed to reconcile bet settlement');
      return reply.status(500).send({ error: 'Failed to reconcile bet settlement' });
    }
  });
}
