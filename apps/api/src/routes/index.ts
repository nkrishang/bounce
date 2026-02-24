import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.routes.js';
import { polymarketRoutes } from './polymarket.routes.js';
import { betRoutes } from './bet.routes.js';

export function registerRoutes(fastify: FastifyInstance) {
  fastify.register(healthRoutes, { prefix: '/health' });
  fastify.register(polymarketRoutes, { prefix: '/polymarket' });
  fastify.register(betRoutes, { prefix: '/bets' });
}
