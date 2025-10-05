import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { MetricsService } from '@/metrics/metrics.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly metrics: MetricsService) {}

  @Get()
  async check() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      db = 'down';
    }
    return { status: 'ok', db, timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.metrics.getMetrics();
      return { status: 'ready', timestamp: new Date().toISOString() };
    } catch (e: any) {
      return { status: 'degraded', error: e?.message || 'unknown', timestamp: new Date().toISOString() };
    }
  }
}