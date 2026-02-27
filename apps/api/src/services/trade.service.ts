import { eq, and, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradeExecutions } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export type TradeExecutionRecord = typeof tradeExecutions.$inferSelect;
type TradeExecutionInsert = typeof tradeExecutions.$inferInsert;

export async function getTradeExecution(bounceAddress: string, betId: number): Promise<TradeExecutionRecord | undefined> {
  const rows = await db
    .select()
    .from(tradeExecutions)
    .where(and(eq(tradeExecutions.bounceAddress, bounceAddress), eq(tradeExecutions.betId, betId)));
  return rows[0];
}

export async function upsertTradeExecution(
  data: Partial<TradeExecutionInsert> & { bounceAddress: string; betId: number },
): Promise<TradeExecutionRecord> {
  const now = new Date();

  const rows = await db
    .insert(tradeExecutions)
    .values({ ...data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [tradeExecutions.bounceAddress, tradeExecutions.betId],
      set: {
        ...data,
        updatedAt: now,
      },
    })
    .returning();

  return rows[0]!;
}

export async function updateTradeExecution(
  bounceAddress: string,
  betId: number,
  data: Partial<Omit<TradeExecutionInsert, 'betId' | 'bounceAddress' | 'createdAt'>>,
): Promise<TradeExecutionRecord | undefined> {
  const rows = await db
    .update(tradeExecutions)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tradeExecutions.bounceAddress, bounceAddress), eq(tradeExecutions.betId, betId)))
    .returning();
  return rows[0];
}

export async function getPendingTradeExecutions(bounceAddress: string): Promise<TradeExecutionRecord[]> {
  return db
    .select()
    .from(tradeExecutions)
    .where(
      and(
        eq(tradeExecutions.bounceAddress, bounceAddress),
        or(
          eq(tradeExecutions.prepareStatus, 'pending'),
          isNull(tradeExecutions.finalizeStatus),
          eq(tradeExecutions.finalizeStatus, 'failed'),
        ),
      ),
    );
}
