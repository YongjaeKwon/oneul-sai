import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MeetupsController } from './meetups.controller.js';
import { MeetupsService } from './meetups.service.js';

@Module({
  controllers: [MeetupsController],
  providers: [
    {
      provide: MeetupsService,
      useFactory: (prisma: PrismaService) => new MeetupsService(prisma),
      inject: [PrismaService],
    },
  ],
})
export class MeetupsModule {}
