import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { RequestLoggerInterceptor } from './common/logging/request-logger.interceptor';
import { LogLevelController } from './common/logging/log-level.controller';
import { GlobalSearchController } from './messages/search.controller';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, UsersModule, ChannelsModule, MessagesModule, PrismaModule, HealthModule, MetricsModule],
  providers: [RequestLoggerInterceptor],
  controllers: [LogLevelController, GlobalSearchController],
})
export class AppModule {}