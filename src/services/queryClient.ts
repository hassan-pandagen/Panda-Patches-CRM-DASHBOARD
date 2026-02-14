// src/services/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,                  // 30 seconds — data goes stale quickly for a CRM
      gcTime: 1000 * 60 * 5,                 // 5 minutes — keep unused cache briefly
      retry: (failureCount) => failureCount < 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: true,             // Refetch when user returns to the tab
      refetchOnReconnect: true,
      refetchOnMount: true,                   // Always refetch when component mounts
    },
    mutations: {
      retry: (failureCount) => failureCount < 2,
    },
  },
});