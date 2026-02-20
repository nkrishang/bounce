'use client';

import {
  type Address,
  type WalletClient,
  type PublicClient,
  type Hash,
  zeroAddress,
} from 'viem';
import { polygon } from 'viem/chains';
import { GnosisSafeAbi } from '@bounce/contracts';
import { sendAndConfirm } from './transaction';

interface SafeTxParams {
  to: Address;
  value?: bigint;
  data?: `0x${string}`;
  operation?: number; // 0 = Call, 1 = DelegateCall
}

export async function signSafeTxHash(
  walletClient: WalletClient,
  account: Address,
  safeTxHash: `0x${string}`
): Promise<`0x${string}`> {
  const signature = await walletClient.signMessage({
    account,
    message: { raw: safeTxHash },
  });

  const r = signature.slice(0, 66);
  const s = '0x' + signature.slice(66, 130);
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;
  v += 4; // Safe signature type adjustment for EOA signatures

  return (r + s.slice(2) + v.toString(16).padStart(2, '0')) as `0x${string}`;
}

export async function execSafeTransaction(
  walletClient: WalletClient,
  publicClient: PublicClient,
  safeAddress: Address,
  owner: Address,
  tx: SafeTxParams
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
    args: [
      to,
      value,
      data,
      operation,
      0n, // safeTxGas
      0n, // baseGas
      0n, // gasPrice
      zeroAddress, // gasToken
      zeroAddress, // refundReceiver
      nonce,
    ],
  });

  const signature = await signSafeTxHash(walletClient, owner, safeTxHash as `0x${string}`);

  const { hash } = await sendAndConfirm(
    publicClient,
    () =>
      walletClient.writeContract({
        chain: polygon,
        address: safeAddress,
        abi: GnosisSafeAbi,
        functionName: 'execTransaction',
        args: [
          to,
          value,
          data,
          operation,
          0n,
          0n,
          0n,
          zeroAddress,
          zeroAddress,
          signature,
        ],
        account: owner,
        gas: 1_000_000n,
      }),
  );

  return hash;
}
