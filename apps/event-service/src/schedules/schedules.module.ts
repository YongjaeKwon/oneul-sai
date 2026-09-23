import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSchedulesController } from './admin-schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

@Module({
  controllers: [AdminSchedulesController],
  providers: [
    {
      provide: SchedulesService,
      useFactory: (prisma: PrismaService) => new SchedulesService(prisma),
      inject: [PrismaService],
    },
  ],
})
export class SchedulesModule {}
