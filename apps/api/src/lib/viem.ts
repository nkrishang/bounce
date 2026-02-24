import { createPublicClient, http, type PublicClient } from 'viem';
import { getChain, SUPPORTED_CHAIN_IDS, type ChainId } from '@bounce/contracts';
import { logger } from './logger.js';

const RPC_URLS: Record<ChainId, string> = {
  137: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
};

logger.info({ rpcUrls: RPC_URLS }, 'Initializing per-chain viem clients');

const clients: Record<ChainId, PublicClient> = {} as Record<ChainId, PublicClient>;
for (const chainId of SUPPORTED_CHAIN_IDS) {
  clients[chainId] = createPublicClient({
    chain: getChain(chainId),
    transport: http(RPC_URLS[chainId]),
  });
}

export function getPublicClient(chainId: ChainId): PublicClient {
  return clients[chainId];
}

export const publicClient = clients[137];
