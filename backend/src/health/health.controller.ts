import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
}