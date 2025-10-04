import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { PresenceService } from '../realtime/presence.service';
import { WsAuthGuard } from '../realtime/ws-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [PrismaModule, ChannelsModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, PresenceService, WsAuthGuard],
})
export class MessagesModule {}