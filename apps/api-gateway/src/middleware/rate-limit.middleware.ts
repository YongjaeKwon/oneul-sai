import { SERVICE_NAMES } from '@oneul-sai/constants';
import { API_ERROR_CODES } from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import type { NextFunction, Request, Response } from 'express';
import { requestId, sendApiError } from '../http/api-error.js';
import { requestPathname } from '../http/request-path.js';

const defaultLogger = createLogger({ service: SERVICE_NAMES.apiGateway });

/**
 * IP 단위 제한 대상 (SPEC-001 7절 5번) — 비밀번호 확인이 일어나거나 인증 없이 scrypt를 태울 수 있는 여섯 경로.
 * 뒤의 세 경로는 Bearer가 있어도 대상이다: 탈취한 access token 하나로 비밀번호 확인 오라클을 IP 제한 없이 돌릴 수 없게 한다.
 * (rate limit은 auth 미들웨어보다 앞에 있으므로 토큰 유무 · 유효성과 무관하게 센다.)
 */
export const RATE_LIMITED_ROUTES: ReadonlyArray<{
  method: string;
  path: string;
}> = [
  { method: 'POST', path: '/api/v1/auth/login' },
  { method: 'POST', path: '/api/v1/auth/refresh' },
  { method: 'POST', path: '/api/v1/members' },
  { method: 'POST', path: '/api/v1/auth/password' },
  { method: 'PATCH', path: '/api/v1/members/me' },
  { method: 'DELETE', path: '/api/v1/members/me' },
];

const WINDOW_MS = 60_000;

export interface RateLimitOptions {
  /** 분당 허용 횟수 = 버킷 용량 (env `RATE_LIMIT_AUTH_PER_MINUTE`) */
  limitPerMinute: number;
  /** 추적하는 IP 수 상한. 넘으면 1분 넘게 조용한 버킷을 정리한다 */
  maxTrackedIps?: number;
  now?: () => number;
  logger?: Logger;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * 같은 핸들러로 가는 경로 변형(끝 슬래시, 대 · 소문자, 퍼센트 인코딩)을 하나로 모은다.
 * 제한 대상 판정에만 쓴다 — 변형으로 버킷을 피해 가지 못하게.
 */
export function normalizeRoutePath(pathname: string): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // 잘못된 인코딩은 원문 그대로 비교한다
  }
  const trimmed = decoded.replace(/\/+$/, '');
  return (trimmed.length === 0 ? '/' : trimmed).toLowerCase();
}

export function isRateLimitedRoute(method: string, pathname: string): boolean {
  const normalized = normalizeRoutePath(pathname);
  return RATE_LIMITED_ROUTES.some(
    (route) => route.method === method && route.path === normalized,
  );
}

/** 로그용 IP 마스킹 (SPEC-001 14절 `gateway.rate_limited`): `1.2.3.*`, IPv6는 앞 절반만 */
export function maskIp(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+)\.\d+$/.exec(ip);
  if (v4?.[1] !== undefined) {
    return `${v4[1]}.*`;
  }
  const groups = ip.split(':');
  if (groups.length > 2) {
    return `${groups.slice(0, Math.ceil(groups.length / 2)).join(':')}:*`;
  }
  return '*';
}

export function clientIp(
  req: Pick<Request, 'ip'> & { socket?: { remoteAddress?: string } },
): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/**
 * IP 단위 인메모리 토큰 버킷 (SPEC-001 7절 5번, 11절, ADR-009 결정 6).
 * 단일 인스턴스 전제다 — 다중 인스턴스에서는 인스턴스마다 따로 세어져 제한이 N배 느슨해진다.
 * 분산(Redis) 제한과 로드밸런서 뒤 클라이언트 IP(`trust proxy`)는 결정 예정 (Step 8).
 */
export function createRateLimitMiddleware(
  options: RateLimitOptions,
): (req: Request, res: Response, next: NextFunction) => void {
  const capacity = options.limitPerMinute;
  const refillPerMs = capacity / WINDOW_MS;
  const maxTrackedIps = options.maxTrackedIps ?? 10_000;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? defaultLogger;
  const buckets = new Map<string, Bucket>();

  const evictIdle = (at: number): void => {
    if (buckets.size <= maxTrackedIps) {
      return;
    }
    for (const [ip, bucket] of buckets) {
      if (at - bucket.updatedAt >= WINDOW_MS) {
        buckets.delete(ip);
      }
    }
  };

  return (req, res, next) => {
    const path = requestPathname(req);
    if (!isRateLimitedRoute(req.method, path)) {
      next();
      return;
    }

    const at = now();
    const ip = clientIp(req);
    const bucket = buckets.get(ip) ?? { tokens: capacity, updatedAt: at };
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + (at - bucket.updatedAt) * refillPerMs,
    );
    bucket.updatedAt = at;
    buckets.set(ip, bucket);
    evictIdle(at);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      next();
      return;
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((1 - bucket.tokens) / refillPerMs / 1000),
    );
    logger.warn('gateway.rate_limited', {
      path,
      ip: maskIp(ip),
      requestId: requestId(req),
    });
    res.setHeader('Retry-After', String(retryAfterSeconds));
    sendApiError(req, res, {
      statusCode: 429,
      error: 'Too Many Requests',
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
      message: '요청이 많아 잠시 후 다시 시도해 주세요.',
    });
  };
}
