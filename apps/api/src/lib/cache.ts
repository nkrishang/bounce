import type Redis from 'ioredis';
import { getRedisClient } from './redis.js';
import { logger } from './logger.js';

export const TTL = {
  IMMUTABLE:    86400,  // 24h  — trade data, token metadata
  ESCROW_LIST:  30,     // 30s  — list of escrow addresses
  ESCROW_STATE: 15,     // 15s  — escrow state (mutable)
  TRENDING:     600,    // 10m  — trending tokens
  PRICE_REF:    30,     // 30s  — indicative/reference prices
} as const;

const DEFAULT_TTL = 15;

interface MemEntry {
  data: string;
  expiresAt: number;
}

class Cache {
  private memFallback = new Map<string, MemEntry>();
  private inflightFetches = new Map<string, Promise<unknown>>();

  private get redis(): Redis | null {
    return getRedisClient();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.redis) {
        const raw = await this.redis.get(key);
        if (raw !== null) {
          logger.debug({ key }, 'Cache hit (Redis)');
          return JSON.parse(raw) as T;
        }
        logger.debug({ key }, 'Cache miss (Redis)');
        return null;
      }
    } catch (err) {
      logger.warn({ key, err }, 'Redis get failed, trying in-memory fallback');
    }

    const entry = this.memFallback.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) this.memFallback.delete(key);
      logger.debug({ key }, 'Cache miss (memory)');
      return null;
    }
    logger.debug({ key }, 'Cache hit (memory)');
    return JSON.parse(entry.data) as T;
  }

  async set<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
    const json = JSON.stringify(data);

    this.memFallback.set(key, {
      data: json,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    try {
      if (this.redis) {
        await this.redis.set(key, json, 'EX', ttlSeconds);
        logger.debug({ key, ttlSeconds }, 'Cache set (Redis)');
      }
    } catch (err) {
      logger.warn({ key, err }, 'Redis set failed, using in-memory only');
    }
  }

  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = DEFAULT_TTL
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const inflight = this.inflightFetches.get(key);
    if (inflight) {
      logger.debug({ key }, 'Joining inflight fetch');
      return inflight as Promise<T>;
    }

    const fetchPromise = (async () => {
      try {
        const result = await fetchFn();
        await this.set(key, result, ttlSeconds);
        return result;
      } finally {
        this.inflightFetches.delete(key);
      }
    })();

    this.inflightFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  async invalidate(key: string): Promise<void> {
    this.memFallback.delete(key);
    try {
      if (this.redis) {
        await this.redis.del(key);
      }
    } catch (err) {
      logger.warn({ key, err }, 'Redis invalidate failed');
    }
    logger.debug({ key }, 'Cache invalidated');
  }

  async invalidateAll(): Promise<void> {
    this.memFallback.clear();
    try {
      if (this.redis) {
        await this.redis.flushdb();
      }
    } catch (err) {
      logger.warn({ err }, 'Redis flushdb failed');
    }
    logger.debug('Cache cleared');
  }
}

export const cache = new Cache();
