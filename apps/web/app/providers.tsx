'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AuthProvider } from '@/lib/auth';
import { isApiClientError } from '@/lib/errors';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 4xx는 다시 불러도 결과가 같다(401은 세션 종료, 403은 정지). 네트워크 · 5xx만 한 번 더 시도한다.
        retry: (failureCount, error) =>
          failureCount < 1 && !(isApiClientError(error) && error.status < 500),
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
