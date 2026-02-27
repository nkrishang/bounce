'use client';

import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Step = 'idle' | 'reconciling' | 'success';

export function useReconcileBet() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setIsLoading(false);
    setError(null);
  }, []);

  const reconcile = useCallback(
    async (betId: number) => {
      setIsLoading(true);
      setError(null);
      setStep('reconciling');

      try {
        const authToken = await getAccessToken();
        if (!authToken) throw new Error('Please sign in');

        const result = await api.post<{
          data: { action: string | null; txHash: string | null; reason?: string };
        }>(`/bets/${betId}/reconcile`, {}, { authToken });

        console.log('[Reconcile] result:', result.data);

        setStep('success');
        await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
        await queryClient.invalidateQueries({ queryKey: ['bet', betId] });
        await queryClient.invalidateQueries({ queryKey: ['trade-status', betId] });
      } catch (err) {
        console.error('[Reconcile] error:', err);
        setError(err instanceof Error ? err.message : 'Settlement failed');
        setStep('idle');
      } finally {
        setIsLoading(false);
      }
    },
    [getAccessToken, queryClient],
  );

  return { reconcile, isLoading, step, error, reset };
}
