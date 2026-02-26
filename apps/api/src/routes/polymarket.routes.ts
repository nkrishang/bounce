import { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';
import { cache } from '../lib/cache.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

function parseMarketPrices(market: any): { pYes: number; pNo: number } {
  try {
    const pricesRaw = market.outcomePrices || market.outcome_prices || '[]';
    const prices: string[] = typeof pricesRaw === 'string' ? JSON.parse(pricesRaw) : pricesRaw;
    const outcomesRaw = market.outcomes || '[]';
    const outcomes: string[] = typeof outcomesRaw === 'string' ? JSON.parse(outcomesRaw) : outcomesRaw;
    const yesIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'yes');
    const pYes = yesIdx >= 0 ? parseFloat(prices[yesIdx] || '0.5') : parseFloat(prices[0] || '0.5');
    return { pYes, pNo: 1 - pYes };
  } catch {
    return { pYes: 0.5, pNo: 0.5 };
  }
}

function scoreMarket(market: any): number {
  if (!market.active || market.closed) return -1;

  const { pYes } = parseMarketPrices(market);
  const volumeNum = market.volumeNum || market.volume_num || parseFloat(market.volume || '0');
  const liquidityNum = market.liquidityNum || market.liquidity_num || parseFloat(market.liquidity || '0');

  // Contention: 1 at 50/50, 0 at extremes
  const contention = 1 - Math.abs(pYes - 0.5) / 0.5;

  const activity = Math.log1p(volumeNum);
  const liq = Math.log1p(liquidityNum);

  const bestBid = market.bestBid ?? market.best_bid ?? 0;
  const bestAsk = market.bestAsk ?? market.best_ask ?? 0;
  const spreadPenalty = bestAsk > 0 && bestBid > 0
    ? Math.exp(-8 * (bestAsk - bestBid))
    : 0.6;

  let score = Math.pow(contention, 2) * activity * liq * spreadPenalty;

  // Heavily penalize dead extremes so they sink to bottom but don't disappear
  if (pYes <= 0.02 || pYes >= 0.98) {
    score *= 0.01;
  }

  return Math.max(score, 0.001);
}

function rankEvents(events: any[]): any[] {
  return events
    .map((event) => {
      if (!event.markets || event.markets.length === 0) return event;

      const scored = event.markets
        .map((m: any) => ({ ...m, _score: scoreMarket(m) }))
        .filter((m: any) => m._score >= 0)
        .sort((a: any, b: any) => b._score - a._score);

      const eventScore = scored.length > 0 ? scored[0]._score : -1;
      return { ...event, markets: scored, _eventScore: eventScore };
    })
    .filter((e) => e._eventScore >= 0 && e.markets.length > 0)
    .sort((a, b) => b._eventScore - a._eventScore);
}

export async function polymarketRoutes(fastify: FastifyInstance) {
  // Proxy: Get active events
  fastify.get('/events', async (request, reply) => {
    const { limit, offset, order, tag_id } = request.query as {
      limit?: string;
      offset?: string;
      order?: string;
      tag_id?: string;
    };

    // Fetch more candidates from Gamma, then score + trim
    const fetchLimit = Math.max(parseInt(limit || '20', 10) * 3, 60);

    const params = new URLSearchParams({
      active: 'true',
      closed: 'false',
      limit: fetchLimit.toString(),
      offset: offset || '0',
      order: order || 'volume24hr',
      ascending: 'false',
    });

    if (tag_id) params.set('tag_id', tag_id);

    const cacheKey = `polymarket-events-v2-${params.toString()}`;
    
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
          const rawEvents = await response.json();
          return rankEvents(rawEvents).slice(0, parseInt(limit || '20', 10));
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

  // Proxy: Get CLOB order book
  fastify.get('/clob/book', async (request, reply) => {
    const { token_id } = request.query as { token_id?: string };

    if (!token_id) {
      return reply.status(400).send({ error: 'token_id is required' });
    }

    const cacheKey = `polymarket-clob-book-${token_id}`;

    try {
      const data = await cache.getOrFetch(
        cacheKey,
        async () => {
          const url = `${CLOB_API}/book?token_id=${token_id}`;
          logger.info({ url }, 'Fetching Polymarket CLOB order book');
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`CLOB API error: ${response.status}`);
          }
          return response.json();
        },
        5
      );
      return { data };
    } catch (error) {
      logger.error(error, 'Failed to fetch Polymarket CLOB order book');
      return reply.status(502).send({ error: 'Failed to fetch Polymarket CLOB order book' });
    }
  });

  // Submit CLOB order (proxied through backend to keep API keys server-side)
  fastify.post('/clob/order', async (request, reply) => {
    try {
      const body = request.body as {
        betId: number;
        order: Record<string, unknown>;
        signature: string;
      };

      if (!body.betId || !body.order || !body.signature) {
        return reply.status(400).send({ error: 'Missing betId, order, or signature' });
      }

      const { upsertTradeExecution } = await import('../services/trade.service.js');

      // Submit order to Polymarket CLOB API
      const orderPayload = {
        ...body.order,
        signature: body.signature,
      };

      const response = await fetch(`${CLOB_API}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, body: errorBody }, 'CLOB order submission failed');
        return reply.status(response.status).send({ error: 'CLOB order submission failed', details: errorBody });
      }

      const result = await response.json() as { orderID?: string; status?: string };

      // Track order in DB
      await upsertTradeExecution({
        betId: body.betId,
        orderId: result.orderID || null,
        clobStatus: result.status || 'SUBMITTED',
      });

      // Start backend polling for settlement + auto-finalize
      if (result.orderID) {
        const { startClobPolling } = await import('../services/clob-poller.js');
        startClobPolling(body.betId, result.orderID);
      }

      logger.info({ betId: body.betId, orderId: result.orderID }, 'CLOB order submitted');
      return { data: result };
    } catch (error) {
      logger.error(error, 'Failed to submit CLOB order');
      return reply.status(500).send({ error: 'Failed to submit CLOB order' });
    }
  });

  // Poll CLOB order status
  fastify.get<{ Params: { orderId: string } }>('/clob/order/:orderId', async (request, reply) => {
    const { orderId } = request.params;

    try {
      const response = await fetch(`${CLOB_API}/order/${orderId}`);
      if (!response.ok) {
        return reply.status(response.status).send({ error: 'CLOB order status fetch failed' });
      }
      const data = await response.json();
      return { data };
    } catch (error) {
      logger.error(error, 'Failed to fetch CLOB order status');
      return reply.status(502).send({ error: 'Failed to fetch CLOB order status' });
    }
  });
}
