'use client';

import {
  type Address,
  type WalletClient,
  type PublicClient,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  getCreate2Address,
} from 'viem';
import { polygon } from 'viem/chains';
import { POLYMARKET_ADDRESSES, PolySafeFactoryAbi } from '@bounce/contracts';
import { sendAndConfirm } from './transaction';

export function deriveSafeAddress(owner: Address): Address {
  const salt = keccak256(
    encodeAbiParameters(parseAbiParameters('address'), [owner])
  );
  return getCreate2Address({
    bytecodeHash: POLYMARKET_ADDRESSES.SAFE_INIT_CODE_HASH as `0x${string}`,
    from: POLYMARKET_ADDRESSES.POLYMARKET_SAFE_FACTORY,
    salt,
  });
}

export async function isSafeDeployed(
  publicClient: PublicClient,
  safeAddress: Address
): Promise<boolean> {
  const code = await publicClient.getCode({ address: safeAddress });
  return !!code && code !== '0x';
}

export async function deployPolySafe(
  walletClient: WalletClient,
  publicClient: PublicClient,
  owner: Address
): Promise<Address> {
  const safeAddress = deriveSafeAddress(owner);

  const deployed = await isSafeDeployed(publicClient, safeAddress);
  if (deployed) {
    console.log('Safe already deployed at:', safeAddress);
    return safeAddress;
  }

  const { hash } = await sendAndConfirm(
    publicClient,
    () =>
      walletClient.writeContract({
        chain: polygon,
        address: POLYMARKET_ADDRESSES.POLYMARKET_SAFE_FACTORY,
        abi: PolySafeFactoryAbi,
        functionName: 'createProxy',
        args: [owner],
        account: owner,
      }),
  );

  console.log('Safe deployed at:', safeAddress, 'tx:', hash);
  return safeAddress;
}
