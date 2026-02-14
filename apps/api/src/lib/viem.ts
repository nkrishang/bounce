import { createPublicClient, http, type Address } from 'viem';
import { polygon } from '@thesis/contracts';
import { logger } from './logger.js';

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

logger.info({ rpcUrl: POLYGON_RPC_URL }, 'Initializing viem client');

export const publicClient = createPublicClient({
  chain: polygon,
  transport: http(POLYGON_RPC_URL),
});

export function getFactoryAddress(): Address {
  const address = process.env.TRADE_ESCROW_FACTORY_ADDRESS;
  if (!address) {
    throw new Error('TRADE_ESCROW_FACTORY_ADDRESS not set');
  }
  return address as Address;
}

export function getUsdcAddress(): Address {
  const address = process.env.USDC_ADDRESS;
  if (!address) {
    throw new Error('USDC_ADDRESS not set');
  }
  return address as Address;
}
