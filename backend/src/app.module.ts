import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [AuthModule, UsersModule, ChannelsModule, MessagesModule, PrismaModule, HealthModule],
  providers: [],
})
export class AppModule {}