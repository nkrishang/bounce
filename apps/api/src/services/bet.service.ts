import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { betMetadata } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export type BetMetadataRecord = typeof betMetadata.$inferSelect;
type BetMetadataInsert = typeof betMetadata.$inferInsert;

export async function getBetMetadata(bounceAddress: string, betId: number): Promise<BetMetadataRecord | undefined> {
  const rows = await db
    .select()
    .from(betMetadata)
    .where(and(eq(betMetadata.bounceAddress, bounceAddress), eq(betMetadata.betId, betId)));
  return rows[0];
}

export async function getBetMetadataByCondition(
  bounceAddress: string,
  conditionId: string,
): Promise<BetMetadataRecord[]> {
  return db
    .select()
    .from(betMetadata)
    .where(and(eq(betMetadata.bounceAddress, bounceAddress), eq(betMetadata.conditionId, conditionId)));
}

export async function getAllBetMetadata(bounceAddress: string): Promise<BetMetadataRecord[]> {
  return db.select().from(betMetadata).where(eq(betMetadata.bounceAddress, bounceAddress));
}

export async function saveBetMetadata(
  data: Omit<BetMetadataInsert, 'createdAt' | 'updatedAt'>,
): Promise<BetMetadataRecord> {
  const now = new Date();

  const rows = await db
    .insert(betMetadata)
    .values({ ...data, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: [betMetadata.bounceAddress, betMetadata.betId] })
    .returning();

  if (rows.length === 0) {
    // Row already existed — immutable-after-first-write
    const existing = await getBetMetadata(data.bounceAddress, data.betId);
    if (existing) return existing;
    throw new Error('Failed to insert bet metadata');
  }

  logger.info({ betId: data.betId }, 'Bet metadata saved');
  return rows[0]!;
}

export async function deleteBetMetadata(bounceAddress: string, betId: number): Promise<boolean> {
  const result = await db
    .delete(betMetadata)
    .where(and(eq(betMetadata.bounceAddress, bounceAddress), eq(betMetadata.betId, betId)))
    .returning();
  return result.length > 0;
}
