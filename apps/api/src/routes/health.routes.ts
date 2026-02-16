import { FastifyInstance } from 'fastify';
import { getRedisClient } from '../lib/redis.js';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    let redisStatus = 'unavailable';
    try {
      const redis = getRedisClient();
      if (redis) {
        const pong = await redis.ping();
        if (pong === 'PONG') redisStatus = 'connected';
      }
    } catch { /* ignore */ }

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      redis: redisStatus,
    };
  });
}
