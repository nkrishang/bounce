import type { Address } from './types.js';

export function bigintToString(value: bigint): string {
  return value.toString();
}

export function stringToBigint(value: string): bigint {
  return BigInt(value);
}

export function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
