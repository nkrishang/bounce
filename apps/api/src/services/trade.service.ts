import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradeExecutions } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export type TradeExecutionRecord = typeof tradeExecutions.$inferSelect;
type TradeExecutionInsert = typeof tradeExecutions.$inferInsert;

export async function getTradeExecution(betId: number): Promise<TradeExecutionRecord | undefined> {
  const rows = await db.select().from(tradeExecutions).where(eq(tradeExecutions.betId, betId));
  return rows[0];
}

export async function upsertTradeExecution(
  data: Partial<TradeExecutionInsert> & { betId: number },
): Promise<TradeExecutionRecord> {
  const now = new Date();

  const rows = await db
    .insert(tradeExecutions)
    .values({ ...data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: tradeExecutions.betId,
      set: {
        ...data,
        updatedAt: now,
      },
    })
    .returning();

  return rows[0]!;
}

export async function updateTradeExecution(
  betId: number,
  data: Partial<Omit<TradeExecutionInsert, 'betId' | 'createdAt'>>,
): Promise<TradeExecutionRecord | undefined> {
  const rows = await db
    .update(tradeExecutions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tradeExecutions.betId, betId))
    .returning();
  return rows[0];
}

export async function getPendingTradeExecutions(): Promise<TradeExecutionRecord[]> {
  const { or, eq, isNull } = await import('drizzle-orm');
  return db
    .select()
    .from(tradeExecutions)
    .where(
      or(
        eq(tradeExecutions.prepareStatus, 'pending'),
        // Has CLOB order but finalize not yet done
        isNull(tradeExecutions.finalizeStatus),
      ),
    );
}
