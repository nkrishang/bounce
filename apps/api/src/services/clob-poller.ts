import { type PublicClient } from 'viem';
import { POLYMARKET_ADDRESSES, BounceAbi } from '@bounce/contracts';
import { normalizeBet, BetStatus } from '@bounce/shared';
import { logger } from '../lib/logger.js';
import { publicClient } from '../lib/viem.js';
import { getTradeExecution, updateTradeExecution } from './trade.service.js';
import { callFinalizeTrade, callClosePosition, reconcileBetSettlement } from './trade-orchestrator.js';

const bounceAddress = POLYMARKET_ADDRESSES.BOUNCE.toLowerCase();

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1_000; // 10 minutes

/** In-memory map of betId → orderId to prevent duplicate pollers and allow replacement. */
const activePollers = new Map<number, string>();

/**
 * Starts polling CLOB order status and on-chain state for settlement detection.
 * When the CLOB order is matched or shares appear on-chain,
 * automatically calls finalizeTrade via the backend signer.
 * Fire-and-forget — does not throw.
 */
export function startClobPolling(betId: number, orderId: string): void {
  const existing = activePollers.get(betId);
  if (existing === orderId) {
    logger.debug({ betId, orderId }, 'CLOB poller already active for same order, skipping');
    return;
  }

  if (existing) {
    logger.info({ betId, oldOrderId: existing, orderId }, 'Replacing active poller with new orderId');
  }

  activePollers.set(betId, orderId);
  logger.info({ betId, orderId }, 'Starting on-chain settlement polling');

  pollLoop(betId, orderId).catch((err) => {
    logger.error({ betId, orderId, err }, 'Settlement poller unexpected error');
  }).finally(() => {
    // Only delete if we are still the active poller
    if (activePollers.get(betId) === orderId) activePollers.delete(betId);
  });
}

async function pollLoop(betId: number, orderId: string): Promise<void> {
  const startedAt = Date.now();
  const client = publicClient as PublicClient;

  while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS);

    // Exit if this poller has been superseded by a newer order
    if (activePollers.get(betId) !== orderId) {
      logger.info({ betId, orderId }, 'Stale poller detected, exiting');
      return;
    }

    try {
      // Read on-chain bet state
      const raw = await client.readContract({
        address: POLYMARKET_ADDRESSES.BOUNCE,
        abi: BounceAbi,
        functionName: 'getBet',
        args: [BigInt(betId)],
      });
      const bet = normalizeBet(raw as Record<string, unknown>);

      // Terminal states — stop polling regardless of flow
      if (bet.status === BetStatus.Closed || bet.status === BetStatus.Withdrawn) {
        logger.info({ betId, status: bet.status }, 'Bet in terminal state on-chain');
        await updateTradeExecution(bounceAddress, betId, { clobStatus: 'CONFIRMED', finalizeStatus: 'confirmed' });
        return;
      }

      // For buy orders (Prepared → Traded), check if already finalized
      // For close orders (Traded), we continue polling
      if (bet.status === BetStatus.Traded) {
        const exec = await getTradeExecution(bounceAddress, betId);
        if (exec?.flow === 'open' && exec?.finalizeStatus === 'confirmed') {
          logger.info({ betId }, 'Buy order already finalized');
          return;
        }
        // Close order — continue polling
      }

      // If no longer Prepared (and not Traded), stop
      if (bet.status !== BetStatus.Prepared && bet.status !== BetStatus.Traded) {
        logger.warn({ betId, status: bet.status }, 'Bet in unexpected status, stopping poller');
        return;
      }

      // Primary: poll CLOB order status API
      try {
        const clobRes = await fetch(`https://clob.polymarket.com/order/${orderId}`);
        if (clobRes.ok) {
          const orderData = await clobRes.json() as { status?: string };
          const status = String(orderData.status || '').toUpperCase();
          if (status) {
            await updateTradeExecution(bounceAddress, betId, { clobStatus: status as any });
          }

          if (status === 'MATCHED' || status === 'CONFIRMED' || status === 'MINED') {
            logger.info({ betId, orderId, clobStatus: status }, 'CLOB order settled, attempting finalize');

            // Extract fill data from CLOB order response
            try {
              const trades = (orderData as any).associate_trades || [];
              let totalSize = 0;
              let totalCost = 0;
              for (const t of trades) {
                const sz = parseFloat(t.size || '0');
                const px = parseFloat(t.price || '0');
                totalSize += sz;
                totalCost += sz * px;
              }
              const avgPrice = totalSize > 0 ? totalCost / totalSize : parseFloat((orderData as any).price || '0');
              const fillAmount = totalSize > 0 ? totalCost : parseFloat((orderData as any).size_matched || '0') * avgPrice;
              if (avgPrice > 0) {
                await updateTradeExecution(bounceAddress, betId, {
                  fillPrice: avgPrice.toString(),
                  fillAmount: fillAmount.toString(),
                });
                logger.info({ betId, avgPrice, fillAmount, tradeCount: trades.length }, 'Captured CLOB fill data');
              }
            } catch (fillErr) {
              logger.warn({ betId, err: fillErr }, 'Failed to extract CLOB fill data');
            }

            await sleep(3000);

            const exec = await getTradeExecution(bounceAddress, betId);
            if (exec?.flow === 'close') {
              await closeFinalize(betId);
            } else {
              await finalize(betId);
            }
            return;
          }

          if (status === 'CANCELED' || status === 'FAILED') {
            logger.warn({ betId, orderId, clobStatus: status }, 'CLOB order failed/cancelled');
            await updateTradeExecution(bounceAddress, betId, {
              clobStatus: status as any,
              lastError: `CLOB order ${status}`,
            });
            return;
          }
        }
      } catch (clobErr) {
        logger.warn({ betId, orderId, err: clobErr }, 'CLOB order status check failed, using fallback');
      }

      // Fallback: check on-chain share balance changes
      try {
        const IConditionalTokensAbi = [{
          inputs: [{ name: 'account', type: 'address' }, { name: 'id', type: 'uint256' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        }] as const;

        const sharesNow = await client.readContract({
          address: POLYMARKET_ADDRESSES.CONDITIONAL_TOKENS,
          abi: IConditionalTokensAbi,
          functionName: 'balanceOf',
          args: [bet.safe as `0x${string}`, bet.positionId],
        }) as bigint;

        if (bet.status === BetStatus.Prepared) {
          // Buy order: check if shares have appeared
          if (sharesNow > bet.positionShares) {
            logger.info({ betId, orderId, sharesNow: sharesNow.toString(), prevShares: bet.positionShares.toString() }, 'Shares detected on-chain, finalizing trade');
            await updateTradeExecution(bounceAddress, betId, { clobStatus: 'CONFIRMED' });
            await finalize(betId);
            return;
          }
        } else if (bet.status === BetStatus.Traded) {
          // Close order: check if shares have decreased
          if (sharesNow < bet.positionShares) {
            logger.info({ betId, orderId, sharesNow: sharesNow.toString(), prevShares: bet.positionShares.toString() }, 'Shares decreased on-chain, finalizing close');
            await updateTradeExecution(bounceAddress, betId, { clobStatus: 'CONFIRMED' });
            await closeFinalize(betId);
            return;
          }
        }
      } catch (shareErr) {
        logger.warn({ betId, err: shareErr }, 'Fallback share balance check failed');
      }
    } catch (err) {
      logger.warn({ betId, orderId, err }, 'Settlement poll iteration error');
    }
  }

  // Timeout: set terminal status so UI can show "failed, reset is safe"
  logger.warn({ betId, orderId }, 'Settlement polling timed out');
  await updateTradeExecution(bounceAddress, betId, {
    clobStatus: 'FAILED',
    lastError: 'Settlement polling timed out',
  });
}

async function finalize(betId: number): Promise<void> {
  const existing = await getTradeExecution(bounceAddress, betId);
  if (existing?.finalizeStatus === 'confirmed' || existing?.finalizeStatus === 'pending') {
    logger.info({ betId }, 'Finalize already in progress or done, skipping');
    return;
  }

  try {
    await callFinalizeTrade(betId);
  } catch (err) {
    logger.error({ betId, err }, 'finalizeTrade failed during settlement polling');
  }
}

async function closeFinalize(betId: number): Promise<void> {
  const existing = await getTradeExecution(bounceAddress, betId);
  if (existing?.finalizeStatus === 'confirmed' || existing?.finalizeStatus === 'pending') {
    logger.info({ betId }, 'Close finalize already in progress or done, skipping');
    return;
  }

  try {
    await callClosePosition(betId);
  } catch (err) {
    logger.error({ betId, err }, 'closePosition failed during settlement polling');
  }
}

/**
 * Sweeps the DB for orders that need polling or reconciliation (e.g. after server restart).
 * For each pending execution, first attempts on-chain reconciliation. If the settlement
 * hasn't landed yet and an orderId exists, restarts the CLOB poller.
 */
export async function sweepPendingOrders(): Promise<void> {
  try {
    const { getPendingTradeExecutions } = await import('./trade.service.js');
    const pending = await getPendingTradeExecutions(bounceAddress);

    for (const exec of pending) {
      if (exec.finalizeStatus === 'confirmed') continue;

      // Try on-chain reconciliation first (handles cases where CLOB settled but poller died)
      try {
        const result = await reconcileBetSettlement(exec.betId);
        if (result.action) {
          logger.info({ betId: exec.betId, action: result.action }, 'Sweep reconciled stuck bet');
          continue;
        }
      } catch (err) {
        logger.warn({ betId: exec.betId, err }, 'Sweep reconciliation attempt failed, will try polling');
      }

      // If reconciliation didn't resolve it, restart poller if we have an orderId
      if (exec.orderId) {
        startClobPolling(exec.betId, exec.orderId);
      }
    }
  } catch (err) {
    logger.error({ err }, 'Sweep pending orders failed');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
