import { Module, type DynamicModule } from '@nestjs/common';
import { env } from '../env.js';
import { MemberClient, type MemberLookup } from './member-client.js';

@Module({})
export class MembersModule {
  /**
   * 위임 호출 클라이언트 하나(global, ADR-011). `MemberClient` 토큰으로 주입한다.
   * 통합 테스트는 member-service를 띄우지 않고 가짜 회원 조회를 넘긴다(SPEC-003 D13). 없으면 env로 만든다.
   */
  static forRoot(memberLookup?: MemberLookup): DynamicModule {
    return {
      module: MembersModule,
      global: true,
      providers: [
        {
          provide: MemberClient,
          useValue:
            memberLookup ??
            new MemberClient({
              baseUrl: env.MEMBER_SERVICE_URL,
              internalToken: env.INTERNAL_API_TOKEN,
            }),
        },
      ],
      exports: [MemberClient],
    };
  }
}
