import { randomUUID } from 'node:crypto';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import type { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.headers[HEADER_REQUEST_ID]) {
    req.headers[HEADER_REQUEST_ID] = randomUUID();
  }
  res.setHeader(HEADER_REQUEST_ID, req.headers[HEADER_REQUEST_ID] as string);
  next();
}
