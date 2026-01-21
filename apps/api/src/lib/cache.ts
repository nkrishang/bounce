import { logger } from './logger.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_SECONDS || '15', 10) * 1000;

class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      logger.debug({ key }, 'Cache entry expired');
      return null;
    }
    logger.debug({ key }, 'Cache hit');
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
    logger.debug({ key }, 'Cache set');
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    logger.debug({ key }, 'Cache invalidated');
  }

  invalidateAll(): void {
    this.cache.clear();
    logger.debug('Cache cleared');
  }
}

export const cache = new SimpleCache();
