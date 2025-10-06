import { Module, forwardRef } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { ReadStateService } from './read-state.service';
import { ChannelRoleGuard } from './channel-role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [PrismaModule, forwardRef(() => MessagesModule)],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelRoleGuard, ReadStateService],
  exports: [ChannelsService, ReadStateService],
})
export class ChannelsModule {}