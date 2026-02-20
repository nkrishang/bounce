import { FastifyInstance } from 'fastify';
import {
  getAllProposals,
  getProposalById,
  getProposalsBySafe,
  getProposalsByUser,
  createProposal,
  updateProposal,
} from '../services/proposal.service.js';
import { logger } from '../lib/logger.js';

export async function proposalRoutes(fastify: FastifyInstance) {
  // Get all proposals
  fastify.get('/', async (request) => {
    const { status, proposer } = request.query as { status?: string; proposer?: string };
    let proposals = getAllProposals();
    
    if (status) {
      proposals = proposals.filter((p) => p.status === status);
    }
    if (proposer) {
      proposals = proposals.filter(
        (p) => p.proposer.toLowerCase() === proposer.toLowerCase()
      );
    }
    
    return { data: proposals };
  });

  // Get proposal by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const proposal = getProposalById(request.params.id);
    if (!proposal) {
      return reply.status(404).send({ error: 'Proposal not found' });
    }
    return { data: proposal };
  });

  // Get proposals by safe address
  fastify.get<{ Params: { safe: string } }>('/by-safe/:safe', async (request) => {
    const proposals = getProposalsBySafe(request.params.safe);
    return { data: proposals };
  });

  // Get proposals by user address
  fastify.get<{ Params: { address: string } }>('/by-user/:address', async (request) => {
    const proposals = getProposalsByUser(request.params.address);
    return { data: proposals };
  });

  // Create proposal
  fastify.post('/', async (request, reply) => {
    try {
      const body = request.body as any;
      
      if (!body.proposer || !body.safe || !body.conditionId || !body.outcomeTokenId) {
        return reply.status(400).send({ 
          error: 'Missing required fields: proposer, safe, conditionId, outcomeTokenId' 
        });
      }

      const proposal = createProposal({
        proposer: body.proposer,
        safe: body.safe,
        guard: body.guard,
        totalCapital: body.totalCapital || '0',
        proposerContribution: body.proposerContribution || '0',
        conditionId: body.conditionId,
        outcomeTokenId: body.outcomeTokenId,
        isYesOutcome: body.isYesOutcome ?? true,
        marketSlug: body.marketSlug,
        marketQuestion: body.marketQuestion,
        marketImage: body.marketImage,
        outcomePrice: body.outcomePrice,
        status: 'PROPOSED',
      });

      return reply.status(201).send({ data: proposal });
    } catch (error) {
      logger.error(error, 'Failed to create proposal');
      return reply.status(500).send({ error: 'Failed to create proposal' });
    }
  });

  // Update proposal (PATCH)
  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const updates = request.body as Partial<any>;
      const proposal = updateProposal(request.params.id, updates);
      if (!proposal) {
        return reply.status(404).send({ error: 'Proposal not found' });
      }
      return { data: proposal };
    } catch (error) {
      logger.error(error, 'Failed to update proposal');
      return reply.status(500).send({ error: 'Failed to update proposal' });
    }
  });
}
