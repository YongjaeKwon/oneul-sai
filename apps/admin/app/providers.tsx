'use client';

import { ApiClientError } from '@oneul-sai/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AuthProvider } from '@/lib/auth-provider';

/** 4xx(인증 · 권한 · 없음 · 검증)는 다시 불러도 같으므로 재시도하지 않는다. 5xx · 네트워크 오류만 한 번 더. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiClientError && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetry, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
