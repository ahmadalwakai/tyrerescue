import { useQuery, UseQueryOptions } from '@tanstack/react-query';

export function usePollingQuery<TData, TError = Error>(
  options: UseQueryOptions<TData, TError> & { intervalMs?: number },
) {
  const { intervalMs = 30_000, ...queryOptions } = options;
  return useQuery({
    refetchInterval: intervalMs,
    refetchIntervalInBackground: true,
    ...queryOptions,
  });
}
