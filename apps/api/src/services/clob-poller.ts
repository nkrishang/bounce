import { type PublicClient } from 'viem';
import { POLYMARKET_ADDRESSES, BounceAbi, ERC20Abi } from '@bounce/contracts';
import { normalizeBet, BetStatus } from '@bounce/shared';
import { logger } from '../lib/logger.js';
import { publicClient } from '../lib/viem.js';
import { getTradeExecution, updateTradeExecution } from './trade.service.js';
import { callFinalizeTrade } from './trade-orchestrator.js';

const bounceAddress = POLYMARKET_ADDRESSES.BOUNCE.toLowerCase();

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1_000; // 10 minutes

/** In-memory set to prevent duplicate pollers for the same bet. */
const activePollers = new Set<number>();

/**
 * Returns the address that actually pulls USDC during CLOB settlement.
 * For neg-risk markets, CTF_EXCHANGE is the underlying spender.
 */
function usdcSpender(exchange: string): `0x${string}` {
  return exchange.toLowerCase() === POLYMARKET_ADDRESSES.NEG_RISK_CTF_EXCHANGE.toLowerCase()
    ? POLYMARKET_ADDRESSES.CTF_EXCHANGE
    : exchange as `0x${string}`;
}

/**
 * Starts polling on-chain state for settlement detection.
 * When the exchange has consumed the USDC allowance (trade settled),
 * automatically calls finalizeTrade via the backend signer.
 * Fire-and-forget — does not throw.
 */
export function startClobPolling(betId: number, orderId: string): void {
  if (activePollers.has(betId)) {
    logger.debug({ betId }, 'CLOB poller already active, skipping');
    return;
  }

  activePollers.add(betId);
  logger.info({ betId, orderId }, 'Starting on-chain settlement polling');

  pollLoop(betId, orderId).catch((err) => {
    logger.error({ betId, orderId, err }, 'Settlement poller unexpected error');
  }).finally(() => {
    activePollers.delete(betId);
  });
}

async function pollLoop(betId: number, orderId: string): Promise<void> {
  const startedAt = Date.now();
  const client = publicClient as PublicClient;

  while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS);

    try {
      // Read on-chain bet state
      const raw = await client.readContract({
        address: POLYMARKET_ADDRESSES.BOUNCE,
        abi: BounceAbi,
        functionName: 'getBet',
        args: [BigInt(betId)],
      });
      const bet = normalizeBet(raw as Record<string, unknown>);

      // If already finalized (Traded/Closed/Withdrawn), stop polling
      if (bet.status === BetStatus.Traded || bet.status === BetStatus.Closed || bet.status === BetStatus.Withdrawn) {
        logger.info({ betId, status: bet.status }, 'Bet already finalized on-chain');
        await updateTradeExecution(bounceAddress, betId, { clobStatus: 'CONFIRMED' });
        return;
      }

      // If no longer Prepared (e.g. unprepared/cancelled), stop
      if (bet.status !== BetStatus.Prepared) {
        logger.warn({ betId, status: bet.status }, 'Bet no longer in Prepared status, stopping poller');
        return;
      }

      // Detect settlement: check if the exchange has consumed the USDC allowance
      const spender = usdcSpender(bet.exchange);
      const remainingAllowance = await client.readContract({
        address: POLYMARKET_ADDRESSES.USDC,
        abi: ERC20Abi,
        functionName: 'allowance',
        args: [bet.safe as `0x${string}`, spender],
      }) as bigint;

      if (remainingAllowance !== bet.inFlightUSDC) {
        // Allowance changed → exchange pulled USDC → trade settled
        logger.info({ betId, orderId, remainingAllowance: remainingAllowance.toString(), inFlightUSDC: bet.inFlightUSDC.toString() }, 'Settlement detected on-chain, finalizing trade');
        await updateTradeExecution(bounceAddress, betId, { clobStatus: 'CONFIRMED' });
        await finalize(betId);
        return;
      }
    } catch (err) {
      logger.warn({ betId, orderId, err }, 'Settlement poll iteration error');
    }
  }

  logger.warn({ betId, orderId }, 'Settlement polling timed out');
  await updateTradeExecution(bounceAddress, betId, { lastError: 'Settlement polling timed out' });
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

/**
 * Sweeps the DB for orders that need polling (e.g. after server restart).
 */
export async function sweepPendingOrders(): Promise<void> {
  try {
    const { getPendingTradeExecutions } = await import('./trade.service.js');
    const pending = await getPendingTradeExecutions(bounceAddress);

    for (const exec of pending) {
      if (!exec.orderId) continue;
      if (exec.finalizeStatus === 'confirmed') continue;

      startClobPolling(exec.betId, exec.orderId);
    }
  } catch (err) {
    logger.error({ err }, 'Sweep pending orders failed');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
