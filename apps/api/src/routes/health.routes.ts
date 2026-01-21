import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    return { ok: true, timestamp: new Date().toISOString() };
  });
}
