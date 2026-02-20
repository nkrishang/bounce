import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.routes.js';
import { tradeRoutes } from './trade.routes.js';
import { tokenRoutes } from './token.routes.js';
import { swapRoutes } from './swap.routes.js';
import { proposalRoutes } from './proposal.routes.js';
import { polymarketRoutes } from './polymarket.routes.js';

export function registerRoutes(fastify: FastifyInstance) {
  fastify.register(healthRoutes, { prefix: '/health' });
  fastify.register(tradeRoutes, { prefix: '/trades' });
  fastify.register(tokenRoutes, { prefix: '/tokens' });
  fastify.register(swapRoutes, { prefix: '/swap' });
  fastify.register(proposalRoutes, { prefix: '/proposals' });
  fastify.register(polymarketRoutes, { prefix: '/polymarket' });
}
