import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { RequestMetricsInterceptor } from './request-metrics.interceptor';

@Global()
@Module({
  providers: [MetricsService, RequestMetricsInterceptor],
  controllers: [MetricsController],
  exports: [MetricsService, RequestMetricsInterceptor],
})
export class MetricsModule {}
