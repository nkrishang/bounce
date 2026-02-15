import { logger } from '../lib/logger.js';

const CODEX_ENDPOINT = 'https://graph.codex.io/graphql';

// Cache trending results for 10 minutes (free tier)
const TRENDING_CACHE_TTL_MS = 600_000;

export interface TrendingTokenSocialLinks {
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
  discord?: string | null;
}

export interface TrendingTokenInfo {
  imageThumbUrl?: string | null;
  imageSmallUrl?: string | null;
  imageLargeUrl?: string | null;
}

export interface TrendingTokenEnhanced {
  address: string;
  name: string;
  symbol: string;
  networkId: number;
  imageThumbUrl?: string | null;
  socialLinks?: TrendingTokenSocialLinks | null;
  info?: TrendingTokenInfo | null;
}

export interface TrendingToken {
  priceUSD: string | null;
  change5m: string | null;
  change1: string | null;
  change4: string | null;
  change24: string | null;
  volume24: string | null;
  marketCap: string | null;
  holders: number | null;
  liquidity: string | null;
  token: TrendingTokenEnhanced;
}

// --- Cache ---

let trendingCache: TrendingToken[] | null = null;
let trendingCacheTime = 0;

const FILTER_TOKENS_QUERY = `
query FilterTrendingTokens($filters: TokenFilters, $statsType: TokenPairStatisticsType, $rankings: [TokenRanking], $limit: Int) {
  filterTokens(filters: $filters, statsType: $statsType, rankings: $rankings, limit: $limit) {
    results {
      priceUSD
      change5m
      change1
      change4
      change24
      volume24
      marketCap
      holders
      liquidity
      token {
        address
        name
        symbol
        networkId
        imageThumbUrl
        socialLinks {
          twitter
          telegram
          website
          discord
        }
        info {
          imageThumbUrl
          imageSmallUrl
          imageLargeUrl
        }
      }
    }
  }
}
`;

const FILTER_TOKENS_VARIABLES = {
  filters: {
    network: [137, 8453, 143],
    trendingIgnored: false,
    liquidity: { gt: 5000 },
    volume24: { gt: 1000 },
    marketCap: { gt: 1_000_000 },
  },
  statsType: 'FILTERED',
  rankings: [{ attribute: 'trendingScore24', direction: 'DESC' }],
  limit: 50,
};

export async function getTrendingTokens(): Promise<TrendingToken[]> {
  if (trendingCache && Date.now() - trendingCacheTime < TRENDING_CACHE_TTL_MS) {
    logger.debug('Returning cached trending tokens');
    return trendingCache;
  }

  const apiKey = process.env.CODEX_IO_API_KEY;
  if (!apiKey) {
    logger.warn('CODEX_IO_API_KEY is not set — returning empty trending list');
    return [];
  }

  logger.info('Fetching trending tokens from Codex.io');

  const res = await fetch(CODEX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query: FILTER_TOKENS_QUERY,
      variables: FILTER_TOKENS_VARIABLES,
    }),
  });

  if (!res.ok) {
    throw new Error(`Codex API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json() as {
    data?: { filterTokens?: { results?: TrendingToken[] } };
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new Error(`Codex GraphQL error: ${json.errors[0].message}`);
  }

  const tokens: TrendingToken[] = json.data?.filterTokens?.results ?? [];

  logger.info({ count: tokens.length }, 'Fetched trending tokens from Codex.io');
  trendingCache = tokens;
  trendingCacheTime = Date.now();

  return tokens;
}
