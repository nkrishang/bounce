import { createPublicClient, http, type Address } from 'viem';
import { monad } from '@escape/contracts';
import { logger } from './logger.js';

const MONAD_RPC_URL = process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz';

logger.info({ rpcUrl: MONAD_RPC_URL }, 'Initializing viem client');

export const publicClient = createPublicClient({
  chain: monad,
  transport: http(MONAD_RPC_URL),
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
