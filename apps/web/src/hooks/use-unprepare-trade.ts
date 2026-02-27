'use client';

import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { parseTransactionError, type ParsedError } from '@/lib/parse-transaction-error';

type Step = 'idle' | 'unpreparing' | 'success';

export interface UnprepareError extends ParsedError {
  errorId: string;
}

export function useUnprepareTrade() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<UnprepareError | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setIsLoading(false);
    setError(null);
  }, []);

  const unprepare = useCallback(
    async (betId: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const authToken = await getAccessToken();
        if (!authToken) throw new Error('Session expired — please sign in again');

        setStep('unpreparing');
        const result = await api.post<{ data: { txHash: string } }>(
          `/bets/${betId}/unprepare`,
          {},
          { authToken },
        );

        await queryClient.invalidateQueries({ queryKey: ['my-bets'] });
        await queryClient.invalidateQueries({ queryKey: ['bets'] });
        await queryClient.invalidateQueries({ queryKey: ['trade-status', betId] });

        setStep('success');
        return result.data.txHash;
      } catch (err) {
        const parsed = parseTransactionError(err);
        const errorId = `UP-${Date.now().toString(36)}`;
        console.error(`[${errorId}] Unprepare trade error:`, err);
        setError({ ...parsed, errorId });
        setStep('idle');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [getAccessToken, queryClient],
  );

  return { unprepare, reset, isLoading, step, error };
}
