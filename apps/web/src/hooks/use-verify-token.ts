'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, isAddress, type Address } from 'viem';
import { getChain } from '@thesis/contracts';
import { TOKENS_BY_CHAIN, type SupportedChainId } from '@thesis/shared';
import { api } from '../lib/api';

const ERC20Abi = [
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

export type VerificationStatus = 'idle' | 'verifying' | 'valid' | 'invalid';

export interface TokenData {
  name: string;
  symbol: string;
  decimals: number;
}

interface PriceResponse {
  liquidityAvailable: boolean;
  buyAmount: string;
}

export function useVerifyToken(chainId: SupportedChainId, tokenAddress: string | undefined) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setStatus('idle');
      setError(null);
      setTokenData(null);
      return;
    }

    if (!isAddress(tokenAddress)) {
      setStatus('invalid');
      setError('Invalid address format');
      setTokenData(null);
      return;
    }

    const usdcAddress = TOKENS_BY_CHAIN[chainId].USDC;

    if (tokenAddress.toLowerCase() === usdcAddress?.toLowerCase()) {
      setStatus('invalid');
      setError('Cannot trade USDC for USDC');
      setTokenData(null);
      return;
    }

    const verify = async () => {
      setStatus('verifying');
      setError(null);
      setTokenData(null);

      const client = createPublicClient({
        chain: getChain(chainId),
        transport: http(),
      });

      try {
        const [name, symbol, decimals] = await Promise.all([
          client.readContract({
            address: tokenAddress as Address,
            abi: ERC20Abi,
            functionName: 'name',
          }),
          client.readContract({
            address: tokenAddress as Address,
            abi: ERC20Abi,
            functionName: 'symbol',
          }),
          client.readContract({
            address: tokenAddress as Address,
            abi: ERC20Abi,
            functionName: 'decimals',
          }),
        ]);

        setTokenData({ name, symbol, decimals });

        // Verify tradability via 0x API (small test amount: 1 USDC = 1e6)
        const testAmount = '1000000';
        const params = new URLSearchParams({
          chainId: chainId.toString(),
          sellToken: usdcAddress,
          buyToken: tokenAddress,
          sellAmount: testAmount,
          taker: '0x0000000000000000000000000000000000000001', // Dummy taker for price check
        });

        const priceResponse = await api.get<PriceResponse>(`/swap/price?${params.toString()}`);

        if (priceResponse.liquidityAvailable && BigInt(priceResponse.buyAmount) > 0n) {
          setStatus('valid');
        } else {
          setStatus('invalid');
          setError('No liquidity available for this token');
        }
      } catch (err) {
        setStatus('invalid');
        if (err instanceof Error && err.message.includes('0x API')) {
          setError('Unable to verify token tradability');
        } else {
          setError('Token not found or not tradable');
        }
      }
    };

    const timer = setTimeout(verify, 500);
    return () => clearTimeout(timer);
  }, [chainId, tokenAddress]);

  return { status, error, tokenData };
}
