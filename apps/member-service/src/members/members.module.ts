import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LoginBackoffService } from '../auth/login-backoff.service.js';
import { PasswordService } from '../auth/password.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenService } from '../tokens/token.service.js';
import { TokensModule } from '../tokens/tokens.module.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [PrismaModule, AuthModule, TokensModule],
  controllers: [MembersController],
  providers: [
    {
      provide: MembersService,
      useFactory: (
        prisma: PrismaService,
        password: PasswordService,
        backoff: LoginBackoffService,
        tokens: TokenService,
      ) => new MembersService(prisma, password, backoff, tokens),
      inject: [
        PrismaService,
        PasswordService,
        LoginBackoffService,
        TokenService,
      ],
    },
  ],
})
export class MembersModule {}
