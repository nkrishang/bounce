import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { getChain, SUPPORTED_CHAIN_IDS, ADDRESSES_BY_CHAIN, type ChainId } from '@bounce/contracts';
import { logger } from './logger.js';

const RPC_URLS: Record<ChainId, string> = {
  137: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  143: process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz',
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

// Backward compat — some old code may import this
export const publicClient = clients[137];

export function getFactoryAddress(chainId: ChainId): Address {
  const addr = ADDRESSES_BY_CHAIN[chainId].TRADE_ESCROW_FACTORY;
  if (addr === '0x0000000000000000000000000000000000000000') {
    logger.warn({ chainId }, 'Factory address is zero — chain may not be deployed yet');
  }
  return addr;
}
