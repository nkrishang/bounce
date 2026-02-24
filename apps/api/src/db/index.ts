import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { logger } from '../lib/logger.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(DATABASE_URL);
export const db = drizzle(client, { schema });

export async function disconnectDb() {
  try {
    await client.end();
    logger.info('Database connection closed');
  } catch (err) {
    logger.error(err, 'Failed to close database connection');
  }
}
