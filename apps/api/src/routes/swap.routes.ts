import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ZERO_X_API_URL,
  ZERO_X_CONTRACTS,
  MONAD_CHAIN_ID,
  MONAD_TOKENS,
  type SwapQuote,
  type ZeroXQuoteResponse,
  type Address,
} from '@thesis/shared';
import { logger } from '../lib/logger.js';

const ZERO_X_API_KEY = process.env.ZERO_X_API_KEY;

if (!ZERO_X_API_KEY) {
  logger.warn('ZERO_X_API_KEY not set - swap quotes will fail');
}

// Simple TTL cache for reference pricing
interface CacheEntry {
  data: IndicativePriceResponse;
  expiresAt: number;
}
const priceCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30000; // 30 seconds

// Reference amount for deriving token prices (10 USDC = 10_000_000 in 6 decimals)
const REFERENCE_USDC_AMOUNT = '10000000';

interface IndicativePriceResponse {
  sellAmount: string;
  buyAmount: string;
  liquidityAvailable: boolean;
  pricePerToken?: string; // AUSD per token (6 decimals)
  derivedFromReference?: boolean;
}

interface GetQuoteQuery {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  slippageBps?: string;
}

export async function swapRoutes(fastify: FastifyInstance) {
  // GET /swap/quote - Get a swap quote from 0x
  fastify.get<{ Querystring: GetQuoteQuery }>(
    '/quote',
    async (request: FastifyRequest<{ Querystring: GetQuoteQuery }>, reply: FastifyReply) => {
      const { sellToken, buyToken, sellAmount, taker, slippageBps } = request.query;

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
          chainId: MONAD_CHAIN_ID.toString(),
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
          allowanceTarget: ZERO_X_CONTRACTS.ALLOWANCE_HOLDER,
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
      const { sellToken, buyToken, sellAmount, taker, slippageBps } = request.query;

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
          chainId: MONAD_CHAIN_ID.toString(),
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
      const { sellToken, buyToken, sellAmount, taker, tokenDecimals: tokenDecimalsStr } = request.query;
      const tokenDecimals = parseInt(tokenDecimalsStr || '18', 10);

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

      // Helper to fetch 0x price/quote with extensive logging
      const fetch0xPrice = async (sell: string, buy: string, amount: string): Promise<{ buyAmount: string; sellAmount: string; liquidityAvailable: boolean } | null> => {
        const params = new URLSearchParams({
          chainId: MONAD_CHAIN_ID.toString(),
          sellToken: sell,
          buyToken: buy,
          sellAmount: amount,
          taker,
        });

        const logContext = { sell, buy, amount };

        // Try quote endpoint first (more reliable - same as sell action)
        let url = `${ZERO_X_API_URL}/swap/allowance-holder/quote?${params.toString()}`;
        try {
          logger.info({ ...logContext, endpoint: 'quote' }, '[indicative-price] Trying 0x /quote endpoint');
          
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              '0x-api-key': ZERO_X_API_KEY!,
              '0x-version': 'v2',
            },
          });

          if (response.ok) {
            const data = await response.json();
            logger.info({ 
              ...logContext, 
              endpoint: 'quote',
              status: response.status,
              liquidityAvailable: data.liquidityAvailable,
              buyAmount: data.buyAmount,
              sellAmount: data.sellAmount,
            }, '[indicative-price] 0x /quote response');
            
            // Quote endpoint returns liquidityAvailable, default to true if not present
            const liquidityAvailable = data.liquidityAvailable ?? true;
            if (liquidityAvailable) {
              return { buyAmount: data.buyAmount, sellAmount: data.sellAmount, liquidityAvailable: true };
            }
            logger.warn({ ...logContext }, '[indicative-price] /quote returned liquidityAvailable=false');
          } else {
            const errorBody = await response.json().catch(() => ({}));
            logger.warn({ 
              ...logContext, 
              endpoint: 'quote',
              status: response.status, 
              error: errorBody 
            }, '[indicative-price] 0x /quote failed');
          }

          return null;
        } catch (err) {
          logger.error({ ...logContext, error: err }, '[indicative-price] Exception in fetch0xPrice');
          return null;
        }
      };

      const requestContext = { sellToken, buyToken, sellAmount, tokenDecimals };
      logger.info(requestContext, '[indicative-price] === START REQUEST ===');

      try {
        // Check cache for reference price (AUSD -> TOKEN)
        const cacheKey = `ref:${sellToken}`;
        const now = Date.now();
        const cached = priceCache.get(cacheKey);
        
        if (cached && cached.expiresAt > now) {
          // Use cached reference price to calculate value
          const pricePerToken = BigInt(cached.data.pricePerToken || '0');
          const balance = BigInt(sellAmount);
          const tokenDecimalsFactor = BigInt(10) ** BigInt(tokenDecimals);
          const valueAusd = (balance * pricePerToken) / tokenDecimalsFactor;
          
          logger.info({ 
            ...requestContext, 
            cacheHit: true,
            pricePerToken: pricePerToken.toString(),
            valueAusd: valueAusd.toString(),
            cacheExpiresIn: cached.expiresAt - now,
          }, '[indicative-price] Using cached reference price');
          
          return reply.send({
            sellAmount,
            buyAmount: valueAusd.toString(),
            liquidityAvailable: true,
            pricePerToken: cached.data.pricePerToken,
            derivedFromReference: true,
          });
        }
        
        logger.info({ ...requestContext, cacheHit: false }, '[indicative-price] Cache miss, fetching fresh price');

        // First, try direct price for the exact amount (TOKEN -> AUSD)
        logger.info({ ...requestContext, step: 'direct' }, '[indicative-price] Step 1: Trying direct TOKEN → AUSD price');
        const directPrice = await fetch0xPrice(sellToken, buyToken, sellAmount);
        
        if (directPrice?.liquidityAvailable) {
          logger.info({ 
            ...requestContext, 
            step: 'direct',
            success: true,
            buyAmount: directPrice.buyAmount 
          }, '[indicative-price] ✓ Direct price available');
          return reply.send({
            sellAmount,
            buyAmount: directPrice.buyAmount,
            liquidityAvailable: true,
            derivedFromReference: false,
          });
        }
        
        logger.warn({ ...requestContext, step: 'direct', result: directPrice }, '[indicative-price] ✗ Direct price failed, trying reference pricing');

        // Direct price failed - use reference pricing
        // Get quote for AUSD -> TOKEN to derive price per token
        logger.info({ 
          ...requestContext, 
          step: 'reference-direct',
          referenceAmount: REFERENCE_USDC_AMOUNT,
        }, '[indicative-price] Step 2: Trying reference quote USDC → TOKEN');
        
        const referenceQuote = await fetch0xPrice(MONAD_TOKENS.USDC, sellToken, REFERENCE_USDC_AMOUNT);
        
        logger.info({ 
          ...requestContext, 
          step: 'reference-direct',
          result: referenceQuote,
        }, '[indicative-price] Reference quote USDC → TOKEN result');
        
        if (!referenceQuote?.liquidityAvailable || !referenceQuote.buyAmount || referenceQuote.buyAmount === '0') {
          // Try routing through WMON: USDC -> WMON -> TOKEN
          logger.info({ 
            ...requestContext, 
            step: 'reference-wmon',
          }, '[indicative-price] Step 3: Reference failed, trying USDC → WMON → TOKEN route');
          
          const usdcToWmon = await fetch0xPrice(MONAD_TOKENS.USDC, MONAD_TOKENS.WMON, REFERENCE_USDC_AMOUNT);
          
          logger.info({ 
            ...requestContext, 
            step: 'reference-wmon-1',
            result: usdcToWmon,
          }, '[indicative-price] USDC → WMON result');
          
          if (usdcToWmon?.liquidityAvailable && usdcToWmon.buyAmount) {
            const wmonToToken = await fetch0xPrice(MONAD_TOKENS.WMON, sellToken, usdcToWmon.buyAmount);
            
            logger.info({ 
              ...requestContext, 
              step: 'reference-wmon-2',
              wmonAmount: usdcToWmon.buyAmount,
              result: wmonToToken,
            }, '[indicative-price] WMON → TOKEN result');
            
            if (wmonToToken?.liquidityAvailable && wmonToToken.buyAmount && wmonToToken.buyAmount !== '0') {
              // Calculate: pricePerToken = referenceUsdc / tokensReceived
              // In 6 decimal precision
              const referenceUsdc = BigInt(REFERENCE_USDC_AMOUNT);
              const tokensReceived = BigInt(wmonToToken.buyAmount);
              const tokenDecimalsFactor = BigInt(10) ** BigInt(tokenDecimals);
              
              // pricePerToken in USDC units (6 decimals) per 1 whole token
              const pricePerToken = (referenceUsdc * tokenDecimalsFactor) / tokensReceived;
              
              // Calculate value of user's balance
              const balance = BigInt(sellAmount);
              const valueUsdc = (balance * pricePerToken) / tokenDecimalsFactor;
              
              // Cache the reference price
              const result: IndicativePriceResponse = {
                sellAmount,
                buyAmount: valueUsdc.toString(),
                liquidityAvailable: true,
                pricePerToken: pricePerToken.toString(),
                derivedFromReference: true,
              };
              
              priceCache.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });
              
              logger.info({ 
                ...requestContext, 
                step: 'reference-wmon',
                success: true,
                tokensReceived: tokensReceived.toString(),
                pricePerToken: pricePerToken.toString(), 
                valueUsdc: valueUsdc.toString(),
              }, '[indicative-price] ✓ Derived price via WMON route');
              return reply.send(result);
            }
          }
          
          // No liquidity available through any route
          logger.error({ 
            ...requestContext,
            usdcToWmonResult: usdcToWmon,
          }, '[indicative-price] ✗✗✗ NO LIQUIDITY through any route');
          
          return reply.send({
            sellAmount,
            buyAmount: '0',
            liquidityAvailable: false,
          });
        }

        // Direct USDC -> TOKEN reference worked
        const referenceUsdc = BigInt(REFERENCE_USDC_AMOUNT);
        const tokensReceived = BigInt(referenceQuote.buyAmount);
        const tokenDecimalsFactor = BigInt(10) ** BigInt(tokenDecimals);
        
        // pricePerToken in USDC units (6 decimals) per 1 whole token
        const pricePerToken = (referenceUsdc * tokenDecimalsFactor) / tokensReceived;
        
        // Calculate value of user's balance
        const balance = BigInt(sellAmount);
        const valueUsdc = (balance * pricePerToken) / tokenDecimalsFactor;
        
        // Cache the reference price
        const result: IndicativePriceResponse = {
          sellAmount,
          buyAmount: valueUsdc.toString(),
          liquidityAvailable: true,
          pricePerToken: pricePerToken.toString(),
          derivedFromReference: true,
        };
        
        priceCache.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });
        
        logger.info({ 
          ...requestContext, 
          step: 'reference-direct',
          success: true,
          tokensReceived: tokensReceived.toString(),
          pricePerToken: pricePerToken.toString(), 
          valueUsdc: valueUsdc.toString(),
        }, '[indicative-price] ✓ Derived price from direct reference quote');
        return reply.send(result);
        
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
