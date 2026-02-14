import { logger } from '../lib/logger.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';

// Cache trending results for 5 minutes (demo tier: 30 req/min, 10k/month)
const TRENDING_CACHE_TTL_MS = 5 * 60 * 1000;
// Cache the coin list for 24 hours (it rarely changes)
const COIN_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Stablecoins to exclude from results
const EXCLUDED_SYMBOLS = new Set([
  'usdc', 'usdt', 'dai', 'busd', 'tusd', 'usdc.e', 'usdd', 'usdt0',
  'crvusd', 'usdq', 'ausd',
]);

export interface TrendingToken {
  address: string;
  name: string;
  symbol: string;
  logoURI: string | null;
  priceUsd: number | null;
  priceChangeH24: number | null;
  volume24h: number | null;
  marketCap: number | null;
}

// --- CoinGecko types ---

interface CoinListEntry {
  id: string;
  symbol: string;
  name: string;
  platforms: Record<string, string>;
}

interface CoinMarketEntry {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
}

// --- Caches ---

let trendingCache: TrendingToken[] | null = null;
let trendingCacheTime = 0;

let coinListCache: Map<string, string> | null = null; // coingecko id -> polygon address
let coinListCacheTime = 0;

function cgHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
  }
  return headers;
}

/**
 * Fetch and cache the full CoinGecko coin list with platform addresses.
 * Returns a map of coingecko_id -> polygon-pos contract address.
 */
async function getPolygonAddressMap(): Promise<Map<string, string>> {
  if (coinListCache && Date.now() - coinListCacheTime < COIN_LIST_CACHE_TTL_MS) {
    return coinListCache;
  }

  logger.info('Fetching CoinGecko coin list with platforms');
  const res = await fetch(`${COINGECKO_BASE}/coins/list?include_platform=true`, {
    headers: cgHeaders(),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko coins/list error: ${res.status} ${res.statusText}`);
  }

  const coins: CoinListEntry[] = await res.json();
  const map = new Map<string, string>();

  for (const coin of coins) {
    const polygonAddr = coin.platforms['polygon-pos'];
    if (polygonAddr) {
      map.set(coin.id, polygonAddr);
    }
  }

  logger.info({ entries: map.size }, 'Built Polygon address map');
  coinListCache = map;
  coinListCacheTime = Date.now();
  return map;
}

export async function getTrendingTokens(): Promise<TrendingToken[]> {
  if (trendingCache && Date.now() - trendingCacheTime < TRENDING_CACHE_TTL_MS) {
    logger.debug('Returning cached trending tokens');
    return trendingCache;
  }

  // Fetch address map and market data in parallel
  const [addressMap, marketsRes] = await Promise.all([
    getPolygonAddressMap(),
    fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&category=polygon-ecosystem&order=volume_desc&per_page=50&page=1`,
      { headers: cgHeaders() }
    ),
  ]);

  if (!marketsRes.ok) {
    throw new Error(`CoinGecko coins/markets error: ${marketsRes.status} ${marketsRes.statusText}`);
  }

  const markets: CoinMarketEntry[] = await marketsRes.json();
  const tokens: TrendingToken[] = [];

  for (const coin of markets) {
    if (EXCLUDED_SYMBOLS.has(coin.symbol.toLowerCase())) continue;

    const address = addressMap.get(coin.id);
    if (!address) continue; // No Polygon contract address — skip

    tokens.push({
      address,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      logoURI: coin.image,
      priceUsd: coin.current_price,
      priceChangeH24: coin.price_change_percentage_24h,
      volume24h: coin.total_volume,
      marketCap: coin.market_cap,
    });
  }

  logger.info({ count: tokens.length }, 'Fetched trending Polygon tokens');
  trendingCache = tokens;
  trendingCacheTime = Date.now();

  return tokens;
}
