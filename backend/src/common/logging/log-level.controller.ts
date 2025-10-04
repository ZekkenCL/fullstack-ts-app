import { Controller, Get, Post, Body } from '@nestjs/common';
import { logger } from './logger';

@Controller('admin/log-level')
export class LogLevelController {
  @Get()
  get() {
    return { level: (logger as any).level }; // pino exposes level property
  }

  @Post()
  set(@Body() body: { level: string }) {
    const { level } = body;
    if (!level) return { error: 'level required' };
    (logger as any).level = level;
    logger.info({ level }, 'log level updated');
    return { level };
  }
}