export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isDefined<T>(v: T): v is NonNullable<T> {
  return v !== null && v !== undefined;
}

// Math.random 기반 non-crypto ID — api-client 등에서 요청 ID 생성용
export function randomId(len = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < len; i += 1) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}
