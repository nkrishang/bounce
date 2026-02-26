import { createWalletClient, http, type WalletClient, type PublicClient, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { BounceAbi, POLYMARKET_ADDRESSES } from '@bounce/contracts';
import { logger } from '../lib/logger.js';
import { publicClient } from '../lib/viem.js';
import { upsertTradeExecution, updateTradeExecution } from './trade.service.js';

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

  await upsertTradeExecution({ betId, prepareStatus: 'pending' });

  try {
    const hash = await client.writeContract({
      chain: polygon,
      address: POLYMARKET_ADDRESSES.BOUNCE,
      abi: BounceAbi,
      functionName: 'prepareTrade',
      args: [BigInt(betId)],
      account,
    });

    await (publicClient as PublicClient).waitForTransactionReceipt({ hash, confirmations: 1 });

    await updateTradeExecution(betId, {
      prepareStatus: 'confirmed',
      prepareTxHash: hash,
    });

    logger.info({ betId, hash }, 'prepareTrade confirmed');
    return hash;
  } catch (err) {
    await updateTradeExecution(betId, {
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

  await updateTradeExecution(betId, { finalizeStatus: 'pending' });

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

    await updateTradeExecution(betId, {
      finalizeStatus: 'confirmed',
      finalizeTxHash: hash,
    });

    logger.info({ betId, hash }, 'finalizeTrade confirmed');
    return hash;
  } catch (err) {
    await updateTradeExecution(betId, {
      finalizeStatus: 'failed',
      lastError: err instanceof Error ? err.message : String(err),
    });
    logger.error({ betId, err }, 'finalizeTrade failed');
    throw err;
  }
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

    await updateTradeExecution(betId, {
      prepareStatus: 'pending',
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
