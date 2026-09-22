export type AccessTokenListener = (token: string | null) => void;

/**
 * access token의 유일한 보관소 — 모듈 · 인스턴스 메모리(SPEC-001 D4). localStorage · 쿠키에 쓰지 않는다.
 * 새로 고침하면 비므로 앱은 부팅 때 `ApiClient.refresh()`로 채운다.
 * `subscribe`는 React의 `useSyncExternalStore` 등 프레임워크가 로그인 여부를 구독하는 용도다.
 */
export class AccessTokenStore {
  private token: string | null = null;
  private readonly listeners = new Set<AccessTokenListener>();

  get(): string | null {
    return this.token;
  }

  set(token: string | null): void {
    if (token === this.token) {
      return;
    }
    this.token = token;
    for (const listener of this.listeners) {
      listener(token);
    }
  }

  clear(): void {
    this.set(null);
  }

  subscribe(listener: AccessTokenListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
