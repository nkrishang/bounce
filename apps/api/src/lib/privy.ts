import { PrivyClient } from '@privy-io/server-auth';
import { logger } from './logger.js';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
      throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be set');
    }
    privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
  }
  return privyClient;
}

/**
 * Verify a Privy access token from the Authorization: Bearer <token> header.
 * Returns the authenticated user's Privy DID.
 */
export async function verifyPrivyToken(authHeader: string | undefined): Promise<{ userId: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  const privy = getPrivyClient();

  const claims = await privy.verifyAuthToken(token);
  return { userId: claims.userId };
}
