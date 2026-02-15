import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { getChain, SUPPORTED_CHAIN_IDS, type ChainId } from '@thesis/contracts';
import { ADDRESSES_BY_CHAIN } from '@thesis/contracts';
import { TOKENS_BY_CHAIN, type SupportedChainId } from '@thesis/shared';
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

function envAddr(name: string): Address | null {
  const v = process.env[name];
  return v ? (v as Address) : null;
}

export function getFactoryAddress(chainId: ChainId): Address {
  const override =
    chainId === 137 ? envAddr('POLYGON_TRADE_ESCROW_FACTORY_ADDRESS') :
    chainId === 8453 ? envAddr('BASE_TRADE_ESCROW_FACTORY_ADDRESS') :
    envAddr('MONAD_TRADE_ESCROW_FACTORY_ADDRESS');

  const addr = override ?? ADDRESSES_BY_CHAIN[chainId].TRADE_ESCROW_FACTORY;
  if (addr === '0x0000000000000000000000000000000000000000') {
    logger.warn({ chainId }, 'Factory address is zero — chain may not be deployed yet');
  }
  return addr;
}

export function getUsdcAddress(chainId: ChainId): Address {
  const override =
    chainId === 137 ? envAddr('POLYGON_USDC_ADDRESS') :
    chainId === 8453 ? envAddr('BASE_USDC_ADDRESS') :
    envAddr('MONAD_USDC_ADDRESS');

  return override ?? TOKENS_BY_CHAIN[chainId as SupportedChainId].USDC;
}
