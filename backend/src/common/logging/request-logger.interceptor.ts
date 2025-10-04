import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';
import { logger } from './logger';

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req: any = context.switchToHttp().getRequest();
    if (!req) return next.handle();
    const requestId = randomUUID();
    const start = Date.now();
    req.requestId = requestId;
    logger.info({ requestId, method: req.method, url: req.url }, 'incoming request');
    return next.handle().pipe(
      tap({
        next: () => {
          logger.info({ requestId, durationMs: Date.now() - start }, 'request completed');
        },
        error: (err) => {
          logger.error({ requestId, durationMs: Date.now() - start, err }, 'request failed');
        },
      }),
    );
  }
}
