import { Module } from '@nestjs/common';
import { MemberClient, type MemberLookup } from '../members/member-client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminApplicationsController } from './admin-applications.controller.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';

@Module({
  controllers: [ApplicationsController, AdminApplicationsController],
  providers: [
    {
      provide: ApplicationsService,
      useFactory: (prisma: PrismaService, members: MemberLookup) =>
        new ApplicationsService(prisma, members),
      inject: [PrismaService, MemberClient],
    },
  ],
})
export class ApplicationsModule {}
