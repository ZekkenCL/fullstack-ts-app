import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { ReactionsService } from './reactions.service';
import { ReactionsController } from './reactions.controller';
import { MessagesGateway } from './messages.gateway';
import { PresenceService } from '../realtime/presence.service';
import { WsAuthGuard } from '../realtime/ws-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelsModule } from '../channels/channels.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [PrismaModule, ChannelsModule, MetricsModule],
  controllers: [MessagesController, ReactionsController],
  providers: [MessagesService, MessagesGateway, PresenceService, WsAuthGuard, ReactionsService],
})
export class MessagesModule {}