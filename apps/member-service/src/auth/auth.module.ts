import { Module } from '@nestjs/common';
import { COOKIE_ENV, type CookieEnv } from '../common/cookies.js';
import { env } from '../env.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenService } from '../tokens/token.service.js';
import { TokensModule } from '../tokens/tokens.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginBackoffService } from './login-backoff.service.js';
import { PasswordService } from './password.service.js';

// 서비스들은 Nest 데코레이터 없이 생성자 인자만 받는다(단위 테스트에서 직접 인스턴스화). env는 여기서만 읽어 넘긴다.
@Module({
  imports: [PrismaModule, TokensModule],
  controllers: [AuthController],
  providers: [
    {
      provide: COOKIE_ENV,
      useValue: {
        COOKIE_SECURE: env.COOKIE_SECURE,
        REFRESH_TTL: env.REFRESH_TTL,
      } satisfies CookieEnv,
    },
    { provide: PasswordService, useFactory: () => new PasswordService() },
    {
      provide: LoginBackoffService,
      useFactory: (prisma: PrismaService) => new LoginBackoffService(prisma),
      inject: [PrismaService],
    },
    {
      provide: AuthService,
      useFactory: (
        prisma: PrismaService,
        password: PasswordService,
        backoff: LoginBackoffService,
        tokens: TokenService,
      ) =>
        new AuthService(prisma, password, backoff, tokens, {
          adminOrigin: env.ADMIN_ORIGIN,
        }),
      inject: [
        PrismaService,
        PasswordService,
        LoginBackoffService,
        TokenService,
      ],
    },
  ],
  exports: [COOKIE_ENV, PasswordService, LoginBackoffService],
})
export class AuthModule {}
