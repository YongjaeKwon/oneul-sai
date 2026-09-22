import { ApiClient } from '@oneul-sai/api-client';

export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});
