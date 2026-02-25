import { FastifyInstance } from 'fastify';
import { erc20Abi, type Address } from 'viem';
import { getPublicClient } from '../lib/viem.js';
import type { ChainId } from '@bounce/contracts';

export async function tokenRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { token: string; account: string };
    Querystring: { chainId: string };
  }>('/:token/balance/:account', async (request, reply) => {
    const { token, account } = request.params;
    const chainId = parseInt(request.query.chainId, 10) as ChainId;

    if (chainId !== 137) {
      return reply.status(400).send({ error: 'Unsupported chainId' });
    }

    const client = getPublicClient(chainId);
    const balance = await client.readContract({
      address: token as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account as Address],
    });

    return { data: { balance: balance.toString() } };
  });

  fastify.get<{
    Params: { account: string };
    Querystring: { chainId: string };
  }>('/native/balance/:account', async (request, reply) => {
    const { account } = request.params;
    const chainId = parseInt(request.query.chainId, 10) as ChainId;

    if (chainId !== 137) {
      return reply.status(400).send({ error: 'Unsupported chainId' });
    }

    const client = getPublicClient(chainId);
    const balance = await client.getBalance({
      address: account as Address,
    });

    return { data: { balance: balance.toString() } };
  });
}
