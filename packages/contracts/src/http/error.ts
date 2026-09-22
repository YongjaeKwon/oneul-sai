export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  /** 기계용 코드(선택, SPEC-001). 값 목록은 각 설계서와 Swagger — 이 패키지의 `API_ERROR_CODES`가 현재 정의된 전체다. */
  code?: string;
  /** query string을 뗀 pathname. */
  path: string;
  requestId?: string;
  timestamp: string;
}
