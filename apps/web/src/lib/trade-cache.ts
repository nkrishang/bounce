import type { QueryClient } from '@tanstack/react-query';
import type { TradeView, TradeStatus, Address } from '@thesis/shared';

type TradeUpdater = (trade: TradeView) => TradeView;

/**
 * Apply an optimistic patch to every query cache entry that contains the
 * given escrow, then guard the patch against stale background refetches
 * (e.g. from refetchInterval) for `guardMs` milliseconds.
 *
 * Returns an unsubscribe function to cancel the guard early.
 */
export function patchTradeInCache(
  queryClient: QueryClient,
  escrow: string,
  updater: TradeUpdater,
  guardMs = 16_000
): () => void {
  applyPatch(queryClient, escrow, updater);

  // Subscribe to the query cache so we can re-apply the optimistic patch
  // whenever a stale background refetch (action.type === 'success') lands
  // for one of the affected query keys.  Once the API-side cache has
  // expired (guardMs), we stop and let fresh data through.
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return;
    if ((event.action as { type: string }).type !== 'success') return;

    const key = event.query.queryKey;
    const isAffected =
      key[0] === 'userTrades' ||
      key[0] === 'trades' ||
      (key[0] === 'trade' && typeof key[1] === 'string' && key[1].toLowerCase() === escrow.toLowerCase());

    if (isAffected) {
      applyPatch(queryClient, escrow, updater);
    }
  });

  const timer = setTimeout(unsubscribe, guardMs);

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

function applyPatch(
  queryClient: QueryClient,
  escrow: string,
  updater: TradeUpdater
) {
  // Patch single trade cache
  queryClient.setQueryData<TradeView>(['trade', escrow], (old) =>
    old ? updater(old) : old
  );

  // Patch all userTrades caches
  const userTradesEntries = queryClient.getQueriesData<{
    asProposer: TradeView[];
    asFunder: TradeView[];
  }>({ queryKey: ['userTrades'] });

  for (const [queryKey, data] of userTradesEntries) {
    if (!data) continue;

    const patchList = (list: TradeView[]) =>
      list.map((t) => (t.escrow.toLowerCase() === escrow.toLowerCase() ? updater(t) : t));

    queryClient.setQueryData(queryKey, {
      asProposer: patchList(data.asProposer),
      asFunder: patchList(data.asFunder),
    });
  }

  // Patch all trades list caches
  const tradesEntries = queryClient.getQueriesData<TradeView[]>({
    queryKey: ['trades'],
  });

  for (const [queryKey, data] of tradesEntries) {
    if (!data) continue;

    const statusFilter = queryKey[1] as TradeStatus | undefined;

    const updated = data
      .map((t) => (t.escrow.toLowerCase() === escrow.toLowerCase() ? updater(t) : t))
      .filter((t) => !statusFilter || t.status === statusFilter);

    queryClient.setQueryData(queryKey, updated);
  }
}

export function insertTradeInUserCache(
  queryClient: QueryClient,
  userAddress: Address,
  trade: TradeView,
  role: 'proposer' | 'funder'
) {
  queryClient.setQueryData<{ asProposer: TradeView[]; asFunder: TradeView[] }>(
    ['userTrades', userAddress],
    (old) => {
      const current = old ?? { asProposer: [], asFunder: [] };
      if (role === 'proposer') {
        return { ...current, asProposer: [...current.asProposer, trade] };
      }
      return { ...current, asFunder: [...current.asFunder, trade] };
    }
  );
}
