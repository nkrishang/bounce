import { logger } from '../lib/logger.js';
import { getTradeExecution, updateTradeExecution } from './trade.service.js';
import { callFinalizeTrade } from './trade-orchestrator.js';

const CLOB_API = 'https://clob.polymarket.com';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1_000; // 10 minutes

/** In-memory set to prevent duplicate pollers for the same bet. */
const activePollers = new Set<number>();

/**
 * Starts polling the Polymarket CLOB for an order's status.
 * When the order is confirmed, automatically calls finalizeTrade via the backend signer.
 * Fire-and-forget — does not throw.
 */
export function startClobPolling(betId: number, orderId: string): void {
  if (activePollers.has(betId)) {
    logger.debug({ betId }, 'CLOB poller already active, skipping');
    return;
  }

  activePollers.add(betId);
  logger.info({ betId, orderId }, 'Starting CLOB order polling');

  pollLoop(betId, orderId).catch((err) => {
    logger.error({ betId, orderId, err }, 'CLOB poller unexpected error');
  }).finally(() => {
    activePollers.delete(betId);
  });
}

async function pollLoop(betId: number, orderId: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const response = await fetch(`${CLOB_API}/order/${orderId}`);
      if (!response.ok) {
        logger.warn({ betId, orderId, status: response.status }, 'CLOB status fetch failed');
        continue;
      }

      const data = (await response.json()) as { status?: string };
      const clobStatus = data.status;

      await updateTradeExecution(betId, { clobStatus: clobStatus || null });

      if (clobStatus === 'CONFIRMED' || clobStatus === 'MINED') {
        logger.info({ betId, orderId, clobStatus }, 'CLOB order confirmed, finalizing trade');
        await finalize(betId);
        return;
      }

      if (clobStatus === 'FAILED' || clobStatus === 'CANCELED') {
        logger.warn({ betId, orderId, clobStatus }, 'CLOB order terminal failure');
        await updateTradeExecution(betId, { lastError: `CLOB order ${clobStatus}` });
        return;
      }
    } catch (err) {
      logger.warn({ betId, orderId, err }, 'CLOB poll iteration error');
    }
  }

  logger.warn({ betId, orderId }, 'CLOB polling timed out');
  await updateTradeExecution(betId, { lastError: 'CLOB polling timed out' });
}

async function finalize(betId: number): Promise<void> {
  // Atomic claim: only proceed if finalizeStatus is not already set
  const existing = await getTradeExecution(betId);
  if (existing?.finalizeStatus === 'confirmed' || existing?.finalizeStatus === 'pending') {
    logger.info({ betId }, 'Finalize already in progress or done, skipping');
    return;
  }

  try {
    await callFinalizeTrade(betId);
  } catch (err) {
    logger.error({ betId, err }, 'finalizeTrade failed during CLOB polling');
  }
}

/**
 * Sweeps the DB for orders that need polling (e.g. after server restart).
 * Call this periodically from the server entry point.
 */
export async function sweepPendingOrders(): Promise<void> {
  try {
    const { getPendingTradeExecutions } = await import('./trade.service.js');
    const pending = await getPendingTradeExecutions();

    for (const exec of pending) {
      if (!exec.orderId) continue;
      if (exec.finalizeStatus === 'confirmed') continue;
      if (exec.clobStatus === 'FAILED' || exec.clobStatus === 'CANCELED') continue;

      startClobPolling(exec.betId, exec.orderId);
    }
  } catch (err) {
    logger.error({ err }, 'Sweep pending orders failed');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
