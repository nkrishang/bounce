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
const MEM_CLEANUP_INTERVAL = 60_000; // sweep expired in-memory entries every 60s

interface MemEntry {
  data: string;
  expiresAt: number;
}

class Cache {
  private memFallback = new Map<string, MemEntry>();
  private inflightFetches = new Map<string, Promise<unknown>>();

  constructor() {
    const timer = setInterval(() => this.sweepExpired(), MEM_CLEANUP_INTERVAL);
    timer.unref(); // don't prevent process exit
  }

  private get redis(): Redis | null {
    return getRedisClient();
  }

  private sweepExpired(): void {
    const now = Date.now();
    let swept = 0;
    for (const [key, entry] of this.memFallback) {
      if (now > entry.expiresAt) {
        this.memFallback.delete(key);
        swept++;
      }
    }
    if (swept > 0) {
      logger.debug({ swept }, 'Swept expired entries from memory cache');
    }
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

  /** Batch-read multiple keys in a single Redis MGET round-trip. */
  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    if (keys.length === 0) return result;

    try {
      if (this.redis) {
        const values = await this.redis.mget(...keys);
        for (let i = 0; i < keys.length; i++) {
          const raw = values[i];
          if (raw !== null) {
            result.set(keys[i]!, JSON.parse(raw) as T);
          }
        }
        logger.debug({ total: keys.length, hits: result.size }, 'Cache mget (Redis)');
        return result;
      }
    } catch (err) {
      logger.warn({ err }, 'Redis mget failed, trying in-memory fallback');
    }

    const now = Date.now();
    for (const key of keys) {
      const entry = this.memFallback.get(key);
      if (entry && now <= entry.expiresAt) {
        result.set(key, JSON.parse(entry.data) as T);
      } else if (entry) {
        this.memFallback.delete(key);
      }
    }
    logger.debug({ total: keys.length, hits: result.size }, 'Cache mget (memory)');
    return result;
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

  /** Batch-write multiple entries in a single Redis pipeline round-trip. */
  async mset(entries: Array<{ key: string; data: unknown; ttlSeconds: number }>): Promise<void> {
    if (entries.length === 0) return;

    const serialized = entries.map(({ key, data, ttlSeconds }) => {
      const json = JSON.stringify(data);
      this.memFallback.set(key, {
        data: json,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return { key, json, ttlSeconds };
    });

    try {
      if (this.redis) {
        const pipeline = this.redis.pipeline();
        for (const { key, json, ttlSeconds } of serialized) {
          pipeline.set(key, json, 'EX', ttlSeconds);
        }
        await pipeline.exec();
        logger.debug({ count: entries.length }, 'Cache mset (Redis pipeline)');
      }
    } catch (err) {
      logger.warn({ err }, 'Redis pipeline set failed, using in-memory only');
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
        // Don't cache null/undefined — treat them as "no result" so
        // subsequent calls re-fetch rather than serving a stale miss.
        if (result !== null && result !== undefined) {
          await this.set(key, result, ttlSeconds);
        }
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
