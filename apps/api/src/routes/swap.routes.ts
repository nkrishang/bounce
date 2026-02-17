import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ZERO_X_API_URL,
  getZeroXAllowanceHolder,
  TOKENS_BY_CHAIN,
  type SupportedChainId,
  type SwapQuote,
  type ZeroXQuoteResponse,
} from '@bounce/shared';
import { SUPPORTED_CHAIN_IDS } from '@bounce/contracts';
import { logger } from '../lib/logger.js';
import { cache, TTL } from '../lib/cache.js';

const ZERO_X_API_KEY = process.env.ZERO_X_API_KEY;

if (!ZERO_X_API_KEY) {
  logger.warn('ZERO_X_API_KEY not set - swap quotes will fail');
}

// Reference amount for deriving token prices (10 USDC = 10_000_000 in 6 decimals)
const REFERENCE_USDC_AMOUNT = '10000000';

interface GetQuoteQuery {
  chainId: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  slippageBps?: string;
}

// ---------------------------------------------------------------------------
// Helpers extracted from the indicative-price handler for reuse & inflight dedup
// ---------------------------------------------------------------------------

interface QuoteResult {
  buyAmount: string;
  sellAmount: string;
  liquidityAvailable: boolean;
}

/** Fetch a 0x /quote for an arbitrary token pair.  Returns null on failure. */
async function fetch0xQuote(
  chainId: number,
  taker: string,
  sell: string,
  buy: string,
  amount: string,
): Promise<QuoteResult | null> {
  if (!ZERO_X_API_KEY) return null;

  const params = new URLSearchParams({
    chainId: chainId.toString(),
    sellToken: sell,
    buyToken: buy,
    sellAmount: amount,
    taker,
  });

  const url = `${ZERO_X_API_URL}/swap/allowance-holder/quote?${params.toString()}`;

  try {
    logger.debug({ sell, buy, amount }, '[0x-quote] Fetching');

    const response = await fetch(url, {
      method: 'GET',
      headers: { '0x-api-key': ZERO_X_API_KEY, '0x-version': 'v2' },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      logger.warn({ sell, buy, amount, status: response.status, error: errorBody }, '[0x-quote] Failed');
      return null;
    }

    const data = await response.json();
    const liquidityAvailable = data.liquidityAvailable ?? true;

    if (!liquidityAvailable) {
      logger.debug({ sell, buy, amount }, '[0x-quote] No liquidity');
      return null;
    }

    return { buyAmount: data.buyAmount, sellAmount: data.sellAmount, liquidityAvailable: true };
  } catch (err) {
    logger.error({ sell, buy, amount, error: err }, '[0x-quote] Exception');
    return null;
  }
}

/**
 * Derive the USDC price-per-token for `tokenAddress` by querying a reference
 * amount through 0x.  Tries USDC -> TOKEN first, then USDC -> WRAPPED_NATIVE -> TOKEN.
 * Returns the price as a string (USDC units with 6 decimals per whole token)
 * or null when no liquidity is found.
 */
async function fetchReferencePricePerToken(
  chainId: SupportedChainId,
  tokenAddress: string,
  tokenDecimals: number,
  taker: string,
): Promise<string | null> {
  const decimalsFactor = BigInt(10) ** BigInt(tokenDecimals);
  const refUsdc = BigInt(REFERENCE_USDC_AMOUNT);

  // Route 1: USDC -> TOKEN direct
  const direct = await fetch0xQuote(
    chainId, taker,
    TOKENS_BY_CHAIN[chainId].USDC,
    tokenAddress,
    REFERENCE_USDC_AMOUNT,
  );

  if (direct && direct.buyAmount !== '0') {
    const price = (refUsdc * decimalsFactor) / BigInt(direct.buyAmount);
    logger.info({ chainId, tokenAddress, route: 'USDC->TOKEN', price: price.toString() }, '[ref-price] Derived');
    return price.toString();
  }

  // Route 2: USDC -> WRAPPED_NATIVE -> TOKEN
  const usdcToWrapped = await fetch0xQuote(
    chainId, taker,
    TOKENS_BY_CHAIN[chainId].USDC,
    TOKENS_BY_CHAIN[chainId].WRAPPED_NATIVE,
    REFERENCE_USDC_AMOUNT,
  );

  if (usdcToWrapped?.liquidityAvailable && usdcToWrapped.buyAmount) {
    const wrappedToToken = await fetch0xQuote(
      chainId, taker,
      TOKENS_BY_CHAIN[chainId].WRAPPED_NATIVE,
      tokenAddress,
      usdcToWrapped.buyAmount,
    );

    if (wrappedToToken && wrappedToToken.buyAmount !== '0') {
      const price = (refUsdc * decimalsFactor) / BigInt(wrappedToToken.buyAmount);
      logger.info({ chainId, tokenAddress, route: 'USDC->WNATIVE->TOKEN', price: price.toString() }, '[ref-price] Derived');
      return price.toString();
    }
  }

  logger.warn({ chainId, tokenAddress }, '[ref-price] No liquidity through any route');
  return null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function swapRoutes(fastify: FastifyInstance) {
  // GET /swap/quote - Get a swap quote from 0x
  fastify.get<{ Querystring: GetQuoteQuery }>(
    '/quote',
    async (request: FastifyRequest<{ Querystring: GetQuoteQuery }>, reply: FastifyReply) => {
      const { chainId: chainIdStr, sellToken, buyToken, sellAmount, taker, slippageBps } = request.query;

      const chainId = Number(chainIdStr);
      if (!chainIdStr || !SUPPORTED_CHAIN_IDS.includes(chainId as any)) {
        return reply.status(400).send({
          error: 'Invalid or missing chainId',
          message: `chainId must be one of: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
        });
      }

      if (!sellToken || !buyToken || !sellAmount || !taker) {
        return reply.status(400).send({
          error: 'Missing required parameters',
          message: 'sellToken, buyToken, sellAmount, and taker are required',
        });
      }

      if (!ZERO_X_API_KEY) {
        return reply.status(500).send({
          error: 'Configuration error',
          message: 'ZERO_X_API_KEY not configured',
        });
      }

      try {
        // Build 0x API URL with query params
        const params = new URLSearchParams({
          chainId: chainId.toString(),
          sellToken,
          buyToken,
          sellAmount,
          taker,
        });

        if (slippageBps) {
          params.append('slippageBps', slippageBps);
        }

        const url = `${ZERO_X_API_URL}/swap/allowance-holder/quote?${params.toString()}`;

        logger.info({ url: url.replace(ZERO_X_API_KEY, '[REDACTED]') }, 'Fetching 0x quote');

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            '0x-api-key': ZERO_X_API_KEY,
            '0x-version': 'v2',
          },
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          logger.error({ status: response.status, errorBody }, '0x API error');
          return reply.status(response.status).send({
            error: '0x API error',
            message: errorBody.reason || errorBody.message || `HTTP ${response.status}`,
            validationErrors: errorBody.validationErrors,
          });
        }

        const quoteResponse: ZeroXQuoteResponse = await response.json();

        // Transform to our simplified format
        const quote: SwapQuote = {
          sellToken: quoteResponse.sellToken,
          buyToken: quoteResponse.buyToken,
          sellAmount: quoteResponse.sellAmount,
          buyAmount: quoteResponse.buyAmount,
          minBuyAmount: quoteResponse.minBuyAmount,
          swapTarget: quoteResponse.transaction.to,
          swapCallData: quoteResponse.transaction.data,
          allowanceTarget: getZeroXAllowanceHolder(chainId as SupportedChainId),
          gas: quoteResponse.gas,
          liquidityAvailable: quoteResponse.liquidityAvailable,
          route: {
            fills: quoteResponse.route.fills,
          },
        };

        logger.info(
          {
            sellToken: quote.sellToken,
            buyToken: quote.buyToken,
            sellAmount: quote.sellAmount,
            buyAmount: quote.buyAmount,
            routeSources: quote.route.fills.map((f) => f.source).join(' -> '),
          },
          '0x quote received'
        );

        return reply.send(quote);
      } catch (error) {
        logger.error({ error }, 'Failed to fetch 0x quote');
        return reply.status(500).send({
          error: 'Internal error',
          message: error instanceof Error ? error.message : 'Failed to fetch quote',
        });
      }
    }
  );

  // GET /swap/price - Get indicative price (no transaction data)
  fastify.get<{ Querystring: GetQuoteQuery }>(
    '/price',
    async (request: FastifyRequest<{ Querystring: GetQuoteQuery }>, reply: FastifyReply) => {
      const { chainId: chainIdStr, sellToken, buyToken, sellAmount, taker, slippageBps } = request.query;

      const chainId = Number(chainIdStr);
      if (!chainIdStr || !SUPPORTED_CHAIN_IDS.includes(chainId as any)) {
        return reply.status(400).send({
          error: 'Invalid or missing chainId',
          message: `chainId must be one of: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
        });
      }

      if (!sellToken || !buyToken || !sellAmount || !taker) {
        return reply.status(400).send({
          error: 'Missing required parameters',
          message: 'sellToken, buyToken, sellAmount, and taker are required',
        });
      }

      if (!ZERO_X_API_KEY) {
        return reply.status(500).send({
          error: 'Configuration error',
          message: 'ZERO_X_API_KEY not configured',
        });
      }

      try {
        const params = new URLSearchParams({
          chainId: chainId.toString(),
          sellToken,
          buyToken,
          sellAmount,
          taker,
        });

        if (slippageBps) {
          params.append('slippageBps', slippageBps);
        }

        const url = `${ZERO_X_API_URL}/swap/allowance-holder/price?${params.toString()}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            '0x-api-key': ZERO_X_API_KEY,
            '0x-version': 'v2',
          },
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          return reply.status(response.status).send({
            error: '0x API error',
            message: errorBody.reason || errorBody.message || `HTTP ${response.status}`,
          });
        }

        const priceResponse = await response.json();
        return reply.send(priceResponse);
      } catch (error) {
        logger.error({ error }, 'Failed to fetch 0x price');
        return reply.status(500).send({
          error: 'Internal error',
          message: error instanceof Error ? error.message : 'Failed to fetch price',
        });
      }
    }
  );

  // GET /swap/indicative-price - Get token valuation using reference pricing
  // This endpoint handles small amounts by deriving price from a reference quote
  fastify.get<{ Querystring: GetQuoteQuery & { tokenDecimals?: string } }>(
    '/indicative-price',
    async (request: FastifyRequest<{ Querystring: GetQuoteQuery & { tokenDecimals?: string } }>, reply: FastifyReply) => {
      const { chainId: chainIdStr, sellToken, buyToken, sellAmount, taker, tokenDecimals: tokenDecimalsStr } = request.query;
      const tokenDecimals = parseInt(tokenDecimalsStr || '18', 10);

      const chainId = Number(chainIdStr);
      if (!chainIdStr || !SUPPORTED_CHAIN_IDS.includes(chainId as any)) {
        return reply.status(400).send({
          error: 'Invalid or missing chainId',
          message: `chainId must be one of: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
        });
      }

      if (!sellToken || !buyToken || !sellAmount || !taker) {
        return reply.status(400).send({
          error: 'Missing required parameters',
          message: 'sellToken, buyToken, sellAmount, and taker are required',
        });
      }

      if (!ZERO_X_API_KEY) {
        return reply.status(500).send({
          error: 'Configuration error',
          message: 'ZERO_X_API_KEY not configured',
        });
      }

      try {
        const cacheKey = `ref-price:${chainId}:${sellToken}`;
        const tokenDecimalsFactor = BigInt(10) ** BigInt(tokenDecimals);

        // 1. Fast path — check for a cached reference price-per-token
        const cachedPrice = await cache.get<string>(cacheKey);
        if (cachedPrice) {
          const valueAusd = (BigInt(sellAmount) * BigInt(cachedPrice)) / tokenDecimalsFactor;
          logger.info({ sellToken, cacheHit: true, pricePerToken: cachedPrice }, '[indicative-price] Cached reference price');
          return reply.send({
            sellAmount,
            buyAmount: valueAusd.toString(),
            liquidityAvailable: true,
            pricePerToken: cachedPrice,
            derivedFromReference: true,
          });
        }

        // 2. Try direct price for the exact amount (no caching — amount-specific)
        const directPrice = await fetch0xQuote(chainId, taker, sellToken, buyToken, sellAmount);
        if (directPrice?.liquidityAvailable) {
          logger.info({ sellToken, buyAmount: directPrice.buyAmount }, '[indicative-price] Direct price available');
          return reply.send({
            sellAmount,
            buyAmount: directPrice.buyAmount,
            liquidityAvailable: true,
            derivedFromReference: false,
          });
        }

        // 3. Derive reference price (with inflight dedup via getOrFetch)
        const pricePerToken = await cache.getOrFetch(
          cacheKey,
          () => fetchReferencePricePerToken(chainId as SupportedChainId, sellToken, tokenDecimals, taker),
          TTL.PRICE_REF,
        );

        if (pricePerToken) {
          const valueAusd = (BigInt(sellAmount) * BigInt(pricePerToken)) / tokenDecimalsFactor;
          return reply.send({
            sellAmount,
            buyAmount: valueAusd.toString(),
            liquidityAvailable: true,
            pricePerToken,
            derivedFromReference: true,
          });
        }

        // 4. No liquidity through any route
        return reply.send({
          sellAmount,
          buyAmount: '0',
          liquidityAvailable: false,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch indicative price');
        return reply.status(500).send({
          error: 'Internal error',
          message: error instanceof Error ? error.message : 'Failed to fetch indicative price',
        });
      }
    }
  );
}
