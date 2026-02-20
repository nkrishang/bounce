import { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';
import { cache } from '../lib/cache.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';

export async function polymarketRoutes(fastify: FastifyInstance) {
  // Proxy: Get active events
  fastify.get('/events', async (request, reply) => {
    const { limit, offset, order, tag_id } = request.query as {
      limit?: string;
      offset?: string;
      order?: string;
      tag_id?: string;
    };

    const params = new URLSearchParams({
      active: 'true',
      closed: 'false',
      limit: limit || '20',
      offset: offset || '0',
      order: order || 'volume',
      ascending: 'false',
    });

    if (tag_id) params.set('tag_id', tag_id);

    const cacheKey = `polymarket-events-${params.toString()}`;
    
    try {
      const data = await cache.getOrFetch(
        cacheKey,
        async () => {
          const url = `${GAMMA_API}/events?${params.toString()}`;
          logger.info({ url }, 'Fetching Polymarket events');
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Gamma API error: ${response.status}`);
          }
          return response.json();
        },
        60
      );
      return { data };
    } catch (error) {
      logger.error(error, 'Failed to fetch Polymarket events');
      return reply.status(502).send({ error: 'Failed to fetch Polymarket events' });
    }
  });

  // Proxy: Get single event by slug
  fastify.get<{ Params: { slug: string } }>('/events/:slug', async (request, reply) => {
    const { slug } = request.params;
    const cacheKey = `polymarket-event-${slug}`;

    try {
      const data = await cache.getOrFetch(
        cacheKey,
        async () => {
          const url = `${GAMMA_API}/events/slug/${slug}`;
          logger.info({ url }, 'Fetching Polymarket event by slug');
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Gamma API error: ${response.status}`);
          }
          return response.json();
        },
        60
      );
      return { data };
    } catch (error) {
      logger.error(error, 'Failed to fetch Polymarket event');
      return reply.status(502).send({ error: 'Failed to fetch Polymarket event' });
    }
  });

  // Proxy: Get markets
  fastify.get('/markets', async (request, reply) => {
    const { limit, offset, order } = request.query as {
      limit?: string;
      offset?: string;
      order?: string;
    };

    const params = new URLSearchParams({
      active: 'true',
      closed: 'false',
      limit: limit || '20',
      offset: offset || '0',
      order: order || 'volume',
      ascending: 'false',
    });

    const cacheKey = `polymarket-markets-${params.toString()}`;

    try {
      const data = await cache.getOrFetch(
        cacheKey,
        async () => {
          const url = `${GAMMA_API}/markets?${params.toString()}`;
          logger.info({ url }, 'Fetching Polymarket markets');
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Gamma API error: ${response.status}`);
          }
          return response.json();
        },
        60
      );
      return { data };
    } catch (error) {
      logger.error(error, 'Failed to fetch Polymarket markets');
      return reply.status(502).send({ error: 'Failed to fetch Polymarket markets' });
    }
  });
}
