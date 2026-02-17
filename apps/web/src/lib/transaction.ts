'use client';

import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Hash,
  type TransactionReceipt,
} from 'viem';
import { getChain, type ChainId } from '@thesis/contracts';

const RPC_URLS: Record<number, string> = {
  137: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || '',
  8453: process.env.NEXT_PUBLIC_BASE_RPC_URL || '',
  143: process.env.NEXT_PUBLIC_MONAD_RPC_URL || '',
};

export interface SendAndConfirmOptions {
  timeout?: number;
  confirmations?: number;
}

export interface SendAndConfirmResult {
  hash: Hash;
  receipt: TransactionReceipt;
}

export async function sendAndConfirm(
  publicClient: PublicClient,
  sendFn: () => Promise<Hash>,
  options?: SendAndConfirmOptions,
): Promise<SendAndConfirmResult> {
  const { timeout = 120_000, confirmations = 1 } = options ?? {};

  const hash = await sendFn();

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout,
    confirmations,
  });

  if (receipt.status !== 'success') {
    throw new Error(`Transaction reverted (hash: ${hash})`);
  }

  return { hash, receipt };
}

export function createClients(
  chainId: ChainId,
  provider: { request: (...args: any[]) => Promise<any> },
): { walletClient: WalletClient; publicClient: PublicClient; chain: Chain } {
  const chain: Chain = getChain(chainId);
  const rpcUrl = RPC_URLS[chainId];

  const walletClient = createWalletClient({
    chain,
    transport: custom(provider),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  return { walletClient, publicClient, chain };
}

export async function getWalletAddress(
  walletClient: WalletClient,
): Promise<`0x${string}`> {
  const [address] = await walletClient.getAddresses();
  return address;
}
