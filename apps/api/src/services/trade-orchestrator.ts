import { createWalletClient, http, type WalletClient, type PublicClient, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { BounceAbi, POLYMARKET_ADDRESSES } from '@bounce/contracts';
import { normalizeBet, BetStatus } from '@bounce/shared';
import { logger } from '../lib/logger.js';
import { publicClient } from '../lib/viem.js';
import { upsertTradeExecution, updateTradeExecution } from './trade.service.js';

const bounceAddress = POLYMARKET_ADDRESSES.BOUNCE.toLowerCase();

let walletClient: WalletClient | null = null;

function getWalletClient(): WalletClient {
  if (walletClient) return walletClient;

  const privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('BACKEND_SIGNER_PRIVATE_KEY not configured');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'),
  });

  logger.info({ address: account.address }, 'Backend signer wallet initialized');
  return walletClient;
}

export async function callPrepareTrade(betId: number): Promise<Hash> {
  const client = getWalletClient();
  const account = client.account;
  if (!account) throw new Error('No account on wallet client');

  logger.info({ betId }, 'Calling prepareTrade');

  await upsertTradeExecution({ bounceAddress, betId, prepareStatus: 'pending' });

  try {
    const hash = await client.writeContract({
      chain: polygon,
      address: POLYMARKET_ADDRESSES.BOUNCE,
      abi: BounceAbi,
      functionName: 'prepareTrade',
      args: [BigInt(betId)],
      account,
    });

    // Record tx hash immediately so we can reconcile if server restarts
    await updateTradeExecution(bounceAddress, betId, { prepareTxHash: hash });

    await (publicClient as PublicClient).waitForTransactionReceipt({ hash, confirmations: 1 });

    await updateTradeExecution(bounceAddress, betId, {
      prepareStatus: 'confirmed',
      prepareTxHash: hash,
    });

    logger.info({ betId, hash }, 'prepareTrade confirmed');
    return hash;
  } catch (err) {
    await updateTradeExecution(bounceAddress, betId, {
      prepareStatus: 'failed',
      lastError: err instanceof Error ? err.message : String(err),
    });
    logger.error({ betId, err }, 'prepareTrade failed');
    throw err;
  }
}

export async function callFinalizeTrade(betId: number): Promise<Hash> {
  const client = getWalletClient();
  const account = client.account;
  if (!account) throw new Error('No account on wallet client');

  logger.info({ betId }, 'Calling finalizeTrade');

  await updateTradeExecution(bounceAddress, betId, { finalizeStatus: 'pending' });

  try {
    const hash = await client.writeContract({
      chain: polygon,
      address: POLYMARKET_ADDRESSES.BOUNCE,
      abi: BounceAbi,
      functionName: 'finalizeTrade',
      args: [BigInt(betId)],
      account,
    });

    await (publicClient as PublicClient).waitForTransactionReceipt({ hash, confirmations: 1 });

    // Read updated on-chain state for diagnostics + fill data
    try {
      const raw = await (publicClient as PublicClient).readContract({
        address: POLYMARKET_ADDRESSES.BOUNCE,
        abi: BounceAbi,
        functionName: 'getBet',
        args: [BigInt(betId)],
      });
      const updatedBet = normalizeBet(raw as Record<string, unknown>);
      logger.info({
        betId,
        usdcSpent: updatedBet.usdcSpent.toString(),
        positionShares: updatedBet.positionShares.toString(),
        escrowUSDC: updatedBet.escrowUSDC.toString(),
        inFlightUSDC: updatedBet.inFlightUSDC.toString(),
        status: updatedBet.status,
      }, 'finalizeTrade on-chain state after confirmation');

      // If on-chain usdcSpent is 0 but shares exist, the allowance-based spent
      // calculation didn't detect the USDC spend. Log a warning for debugging.
      if (updatedBet.usdcSpent === 0n && updatedBet.positionShares > 0n) {
        logger.warn({ betId }, 'finalizeTrade: usdcSpent is 0 despite shares existing — allowance spender may be wrong');
      }
    } catch (readErr) {
      logger.warn({ betId, err: readErr }, 'Failed to read on-chain state after finalizeTrade');
    }

    await updateTradeExecution(bounceAddress, betId, {
      finalizeStatus: 'confirmed',
      finalizeTxHash: hash,
    });

    logger.info({ betId, hash }, 'finalizeTrade confirmed');
    return hash;
  } catch (err) {
    await updateTradeExecution(bounceAddress, betId, {
      finalizeStatus: 'failed',
      lastError: err instanceof Error ? err.message : String(err),
    });
    logger.error({ betId, err }, 'finalizeTrade failed');
    throw err;
  }
}

export async function callClosePosition(betId: number): Promise<Hash> {
  const client = getWalletClient();
  const account = client.account;
  if (!account) throw new Error('No account on wallet client');

  logger.info({ betId }, 'Calling closePosition');

  await updateTradeExecution(bounceAddress, betId, { finalizeStatus: 'pending' });

  try {
    const hash = await client.writeContract({
      chain: polygon,
      address: POLYMARKET_ADDRESSES.BOUNCE,
      abi: BounceAbi,
      functionName: 'closePosition',
      args: [BigInt(betId)],
      account,
    });

    await (publicClient as PublicClient).waitForTransactionReceipt({ hash, confirmations: 1 });

    await updateTradeExecution(bounceAddress, betId, {
      finalizeStatus: 'confirmed',
      finalizeTxHash: hash,
    });

    logger.info({ betId, hash }, 'closePosition confirmed');
    return hash;
  } catch (err) {
    await updateTradeExecution(bounceAddress, betId, {
      finalizeStatus: 'failed',
      lastError: err instanceof Error ? err.message : String(err),
    });
    logger.error({ betId, err }, 'closePosition failed');
    throw err;
  }
}

export type ReconcileResult = {
  action: 'finalizeTrade' | 'closePosition' | null;
  txHash: Hash | null;
  reason?: string;
};

/**
 * Checks on-chain state and calls finalizeTrade or closePosition if settlement
 * has occurred but the contract hasn't been updated yet.
 * Safe to call repeatedly — idempotent and won't send txs that would revert.
 */
export async function reconcileBetSettlement(betId: number): Promise<ReconcileResult> {
  const client = publicClient as PublicClient;

  const raw = await client.readContract({
    address: POLYMARKET_ADDRESSES.BOUNCE,
    abi: BounceAbi,
    functionName: 'getBet',
    args: [BigInt(betId)],
  });
  const bet = normalizeBet(raw as Record<string, unknown>);

  // Already terminal — nothing to do
  if (bet.status === BetStatus.Closed || bet.status === BetStatus.Withdrawn) {
    await updateTradeExecution(bounceAddress, betId, { finalizeStatus: 'confirmed' });
    return { action: null, txHash: null, reason: 'already_terminal' };
  }

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

  // Prepared + shares increased → buy order settled, finalize trade
  if (bet.status === BetStatus.Prepared && sharesNow > bet.positionShares) {
    logger.info({ betId, sharesNow: sharesNow.toString(), prevShares: bet.positionShares.toString() }, 'Reconcile: shares appeared, calling finalizeTrade');
    const txHash = await callFinalizeTrade(betId);
    return { action: 'finalizeTrade', txHash };
  }

  // Traded + shares decreased OR only dust remains → close position
  const DUST_THRESHOLD = 10_000n;
  if (bet.status === BetStatus.Traded && (sharesNow < bet.positionShares || sharesNow <= DUST_THRESHOLD)) {
    logger.info({ betId, sharesNow: sharesNow.toString(), prevShares: bet.positionShares.toString() }, 'Reconcile: calling closePosition');
    const txHash = await callClosePosition(betId);
    return { action: 'closePosition', txHash };
  }

  logger.info({ betId, status: bet.status, sharesNow: sharesNow.toString(), positionShares: bet.positionShares.toString() }, 'Reconcile: not_ready');

  return { action: null, txHash: null, reason: 'not_ready' };
}

export async function callUnprepareTrade(betId: number): Promise<Hash> {
  const client = getWalletClient();
  const account = client.account;
  if (!account) throw new Error('No account on wallet client');

  logger.info({ betId }, 'Calling unprepareTrade');

  try {
    const hash = await client.writeContract({
      chain: polygon,
      address: POLYMARKET_ADDRESSES.BOUNCE,
      abi: BounceAbi,
      functionName: 'unprepareTrade',
      args: [BigInt(betId)],
      account,
    });

    await (publicClient as PublicClient).waitForTransactionReceipt({ hash, confirmations: 1 });

    await upsertTradeExecution({
      bounceAddress,
      betId,
      prepareStatus: 'failed',
      prepareTxHash: null,
      orderId: null,
      clobStatus: null,
      finalizeStatus: null,
      finalizeTxHash: null,
      lastError: null,
    });

    logger.info({ betId, hash }, 'unprepareTrade confirmed');
    return hash;
  } catch (err) {
    logger.error({ betId, err }, 'unprepareTrade failed');
    throw err;
  }
}
