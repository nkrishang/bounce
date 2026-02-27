import { pgTable, integer, text, boolean, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';

export const betMetadata = pgTable('bet_metadata', {
  bounceAddress: text('bounce_address').notNull(),
  betId: integer('bet_id').notNull(),
  chainId: integer('chain_id').notNull(),
  slug: text('slug').notNull().default(''),
  conditionId: text('condition_id').notNull(),
  outcomeIndex: integer('outcome_index').notNull(),
  outcomeTokenId: text('outcome_token_id').notNull(),
  isYesOutcome: boolean('is_yes_outcome').notNull().default(true),
  marketQuestion: text('market_question').notNull().default(''),
  marketImage: text('market_image'),
  outcomePrice: text('outcome_price').notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.bounceAddress, t.betId] }),
  index('bet_metadata_bounce_condition_idx').on(t.bounceAddress, t.conditionId),
]);

export const tradeExecutions = pgTable('trade_executions', {
  bounceAddress: text('bounce_address').notNull(),
  betId: integer('bet_id').notNull(),
  flow: text('flow').notNull().default('open'), // 'open' for buy, 'close' for sell
  prepareStatus: text('prepare_status').notNull().default('pending'),
  prepareTxHash: text('prepare_tx_hash'),
  orderId: text('order_id'),
  clobStatus: text('clob_status'),
  finalizeStatus: text('finalize_status'),
  finalizeTxHash: text('finalize_tx_hash'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.bounceAddress, t.betId] }),
]);
