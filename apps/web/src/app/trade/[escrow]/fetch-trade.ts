const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const SUPPORTED_CHAIN_IDS = [137, 8453, 143] as const;

interface TradeData {
  chainId: number;
  escrow: string;
  data: {
    proposer: string;
    expirationTimestamp: number;
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    metadataUri: string;
  };
  state: Record<string, unknown>;
  status: string;
}

export async function fetchTradeByEscrow(escrow: string): Promise<TradeData | null> {
  const results = await Promise.allSettled(
    SUPPORTED_CHAIN_IDS.map(async (chainId) => {
      const res = await fetch(`${API_URL}/trades/${escrow}?chainId=${chainId}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data as TradeData;
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') return result.value;
  }
  return null;
}
