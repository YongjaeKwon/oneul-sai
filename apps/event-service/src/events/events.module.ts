import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PublicEventsController } from './public-events.controller.js';
import { PublicEventsService } from './public-events.service.js';

@Module({
  controllers: [PublicEventsController],
  providers: [
    {
      provide: PublicEventsService,
      useFactory: (prisma: PrismaService) => new PublicEventsService(prisma),
      inject: [PrismaService],
    },
  ],
})
export class EventsModule {}
