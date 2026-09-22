import type { ClientRequest, IncomingMessage } from 'node:http';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import { HEADER_INTERNAL_TOKEN } from '@oneul-sai/contracts';

/**
 * 프록시하는 모든 요청에 `x-request-id`와 `x-internal-token`을 붙인다 (SPEC-001 7절 4번).
 * 들어온 `x-internal-token`은 auth 미들웨어가 이미 지웠으므로 여기서 붙는 값이 유일하다.
 */
export function attachInternalHeaders(
  proxyReq: Pick<ClientRequest, 'setHeader'>,
  req: Pick<IncomingMessage, 'headers'>,
  internalToken: string,
): void {
  const requestId = req.headers[HEADER_REQUEST_ID];
  if (typeof requestId === 'string') {
    proxyReq.setHeader(HEADER_REQUEST_ID, requestId);
  }
  proxyReq.setHeader(HEADER_INTERNAL_TOKEN, internalToken);
}
