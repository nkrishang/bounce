'use client';

/**
 * @deprecated executeTrade is deprecated. Use useSignAndSubmitOrder instead.
 * The Polymarket CTF Exchange requires CLOB order signing, not direct trade calls.
 */
export { useSignAndSubmitOrder as useExecuteTrade } from './use-sign-and-submit-order';
