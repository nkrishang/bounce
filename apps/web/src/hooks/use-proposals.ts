'use client';

import { useQuery } from '@tanstack/react-query';
import type { Proposal } from '@bounce/shared';
import { api } from '@/lib/api';

export function useProposals(status?: string) {
  return useQuery({
    queryKey: ['proposals', status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const response = await api.get<{ data: Proposal[] }>(`/proposals?${params.toString()}`);
      return response.data;
    },
  });
}

export function useProposal(id: string | undefined) {
  return useQuery({
    queryKey: ['proposal', id],
    queryFn: async () => {
      if (!id) throw new Error('No id');
      const response = await api.get<{ data: Proposal }>(`/proposals/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useUserProposals(address: string | undefined) {
  return useQuery({
    queryKey: ['user-proposals', address],
    queryFn: async () => {
      if (!address) throw new Error('No address');
      const response = await api.get<{ data: Proposal[] }>(`/proposals/by-user/${address}`);
      return response.data;
    },
    enabled: !!address,
  });
}
