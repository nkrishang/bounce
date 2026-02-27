import { createHmac } from 'crypto';
import { logger } from './logger.js';

const CLOB_API = 'https://clob.polymarket.com';

interface ClobCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

/** Per-signer credential cache (keyed by lowercase address). */
const credsByAddress = new Map<string, ClobCredentials>();

/** Clear cached CLOB credentials for a signer address (e.g. on 401). */
export function clearClobCredentials(address: string): void {
  credsByAddress.delete(address.toLowerCase());
}

/**
 * Derive CLOB API credentials for a user address using their L1 EIP-712 signature.
 * The signature must be over the ClobAuthDomain typed data signed by the user's wallet.
 * Tries POST /auth/api-key first, falls back to GET /auth/derive-api-key.
 */
export async function deriveCredentialsForAddress(
  address: string,
  signature: string,
  timestamp: number,
  nonce: number,
): Promise<ClobCredentials> {
  const key = address.toLowerCase();
  const cached = credsByAddress.get(key);
  if (cached) return cached;

  const l1Headers: Record<string, string> = {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: `${timestamp}`,
    POLY_NONCE: `${nonce}`,
  };

  // Try creating new credentials
  let response = await fetch(`${CLOB_API}/auth/api-key`, {
    method: 'POST',
    headers: l1Headers,
  });

  // If create fails, derive existing credentials
  if (!response.ok) {
    logger.info({ status: response.status, address }, 'Create API key failed, deriving existing');
    response = await fetch(`${CLOB_API}/auth/derive-api-key`, {
      method: 'GET',
      headers: l1Headers,
    });
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to get CLOB credentials: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { apiKey: string; secret: string; passphrase: string };

  if (!data.apiKey || !data.secret || !data.passphrase) {
    throw new Error(
      `Incomplete CLOB credentials: apiKey=${!!data.apiKey}, secret=${!!data.secret}, passphrase=${!!data.passphrase}`,
    );
  }

  const creds: ClobCredentials = {
    apiKey: data.apiKey,
    secret: data.secret,
    passphrase: data.passphrase,
  };

  credsByAddress.set(key, creds);
  logger.info({ address, apiKey: creds.apiKey }, 'CLOB credentials derived for address');
  return creds;
}

/**
 * Get cached CLOB credentials for a signer address. Returns null if not yet derived.
 */
export function getClobCredentialsForAddress(address: string): ClobCredentials | null {
  return credsByAddress.get(address.toLowerCase()) || null;
}

/**
 * Decode the CLOB API secret from base64url to raw bytes.
 * Matches the official Polymarket TS CLOB client's base64ToArrayBuffer().
 */
function decodeSecret(secret: string): Buffer {
  const sanitized = secret
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  return Buffer.from(sanitized, 'base64');
}

function buildHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string,
): string {
  let message = `${timestamp}${method}${requestPath}`;
  if (body !== undefined) {
    message += body;
  }

  const keyBuffer = decodeSecret(secret);
  const sig = createHmac('sha256', keyBuffer).update(message).digest('base64');

  // base64 → base64url, keep '=' padding (matches official client)
  return sig.replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Create L2 POLY_* headers for an authenticated CLOB request using per-address credentials.
 */
export function createL2Headers(
  creds: ClobCredentials,
  address: string,
  method: string,
  requestPath: string,
  body?: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildHmacSignature(creds.secret, timestamp, method, requestPath, body);

  return {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: `${timestamp}`,
    POLY_API_KEY: creds.apiKey,
    POLY_PASSPHRASE: creds.passphrase,
  };
}
