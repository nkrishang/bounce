'use client';

import {
  type Address,
  type WalletClient,
  type PublicClient,
  type Hash,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  getCreate2Address,
  encodeFunctionData,
  zeroAddress,
} from 'viem';
import { polygon } from 'viem/chains';
import { POLYMARKET_ADDRESSES, PolySafeFactoryAbi, GnosisSafeAbi } from '@bounce/contracts';
import { sendAndConfirm } from './transaction';

interface SafeTxParams {
  to: Address;
  value?: bigint;
  data?: `0x${string}`;
  operation?: number;
}

async function signSafeTxHash(
  walletClient: WalletClient,
  account: Address,
  safeTxHash: `0x${string}`,
): Promise<`0x${string}`> {
  const signature = await walletClient.signMessage({
    account,
    message: { raw: safeTxHash },
  });
  const r = signature.slice(0, 66);
  const s = '0x' + signature.slice(66, 130);
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;
  v += 4;
  return (r + s.slice(2) + v.toString(16).padStart(2, '0')) as `0x${string}`;
}

async function execSafeTransaction(
  walletClient: WalletClient,
  publicClient: PublicClient,
  safeAddress: Address,
  owner: Address,
  tx: SafeTxParams,
): Promise<Hash> {
  const to = tx.to;
  const value = tx.value ?? 0n;
  const data = tx.data ?? '0x';
  const operation = tx.operation ?? 0;

  const nonce = await publicClient.readContract({
    address: safeAddress,
    abi: GnosisSafeAbi,
    functionName: 'nonce',
  });

  const safeTxHash = await publicClient.readContract({
    address: safeAddress,
    abi: GnosisSafeAbi,
    functionName: 'getTransactionHash',
    args: [to, value, data, operation, 0n, 0n, 0n, zeroAddress, zeroAddress, nonce],
  });

  const signature = await signSafeTxHash(walletClient, owner, safeTxHash as `0x${string}`);

  const { hash } = await sendAndConfirm(publicClient, () =>
    walletClient.writeContract({
      chain: polygon,
      address: safeAddress,
      abi: GnosisSafeAbi,
      functionName: 'execTransaction',
      args: [to, value, data, operation, 0n, 0n, 0n, zeroAddress, zeroAddress, signature],
      account: owner,
      gas: 1_000_000n,
    }),
  );

  return hash;
}

const GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8n;

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

export async function isBounceModuleEnabled(
  publicClient: PublicClient,
  safeAddress: Address
): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: safeAddress,
      abi: GnosisSafeAbi,
      functionName: 'isModuleEnabled',
      args: [POLYMARKET_ADDRESSES.BOUNCE],
    });
    return result as boolean;
  } catch {
    return false;
  }
}

export async function isBounceGuardInstalled(
  publicClient: PublicClient,
  safeAddress: Address
): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: safeAddress,
      abi: GnosisSafeAbi,
      functionName: 'getStorageAt',
      args: [GUARD_STORAGE_SLOT, 1n],
    });
    const guardAddress = ('0x' + (result as `0x${string}`).slice(-40)) as Address;
    return guardAddress.toLowerCase() === POLYMARKET_ADDRESSES.BOUNCE.toLowerCase();
  } catch {
    return false;
  }
}

export type SafeReadyStep = 'idle' | 'deploying-safe' | 'enabling-module' | 'setting-guard' | 'ready';

export async function ensureSafeReady(
  walletClient: WalletClient,
  publicClient: PublicClient,
  ownerAddress: Address,
  onStep?: (step: SafeReadyStep) => void,
): Promise<Address> {
  const safeAddress = deriveSafeAddress(ownerAddress);

  onStep?.('deploying-safe');
  const deployed = await isSafeDeployed(publicClient, safeAddress);
  if (!deployed) {
    await deployPolySafe(walletClient, publicClient, ownerAddress);
  }

  const moduleEnabled = await isBounceModuleEnabled(publicClient, safeAddress);
  if (!moduleEnabled) {
    onStep?.('enabling-module');
    const enableModuleData = encodeFunctionData({
      abi: GnosisSafeAbi,
      functionName: 'enableModule',
      args: [POLYMARKET_ADDRESSES.BOUNCE],
    });
    await execSafeTransaction(walletClient, publicClient, safeAddress, ownerAddress, {
      to: safeAddress,
      data: enableModuleData,
    });
  }

  // Must set guard LAST — after guard is set, no more direct Safe txs
  const guardInstalled = await isBounceGuardInstalled(publicClient, safeAddress);
  if (!guardInstalled) {
    onStep?.('setting-guard');
    const setGuardData = encodeFunctionData({
      abi: GnosisSafeAbi,
      functionName: 'setGuard',
      args: [POLYMARKET_ADDRESSES.BOUNCE],
    });
    await execSafeTransaction(walletClient, publicClient, safeAddress, ownerAddress, {
      to: safeAddress,
      data: setGuardData,
    });
  }

  onStep?.('ready');
  return safeAddress;
}
