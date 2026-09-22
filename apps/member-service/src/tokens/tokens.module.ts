import { Module } from '@nestjs/common';
import { env } from '../env.js';
import { decodeAccessSecret, TokenService } from './token.service.js';

@Module({
  providers: [
    {
      provide: TokenService,
      useFactory: () =>
        new TokenService({
          secret: decodeAccessSecret(env.JWT_ACCESS_SECRET),
          accessTtlSeconds: env.JWT_ACCESS_TTL,
          refreshTtlSeconds: env.REFRESH_TTL,
        }),
    },
  ],
  exports: [TokenService],
})
export class TokensModule {}
