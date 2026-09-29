import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { MeResponse, Meta } from '@zm/shared';
import { api } from './client';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/api/auth/me'),
    staleTime: 60_000,
  });
}

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/api/meta'), staleTime: 30_000 });
}

/** Analytics endpoints: keep the previous render while refetching (no skeleton flash). */
export function useAnalytics<T>(
  name: string,
  query: Record<string, string | number | undefined>,
  enabled = true,
) {
  return useQuery({
    queryKey: ['analytics', name, query],
    queryFn: () => api<T>(`/api/analytics/${name}`, { query }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
