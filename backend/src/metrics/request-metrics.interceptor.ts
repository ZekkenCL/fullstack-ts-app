import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    if (!req) return next.handle();
    const method = req.method;
    const route = req.route?.path || req.url || 'unknown';
    const start = process.hrtime.bigint();
    return next.handle().pipe(
      tap({
        next: () => {
          const status = http.getResponse()?.statusCode || 200;
          this.observe(method, route, status, start);
        },
        error: (err) => {
          const status = err?.status || 500;
          this.observe(method, route, status, start);
        },
      }),
    );
  }

  private observe(method: string, route: string, status: number, start: bigint) {
    const diffNs = Number(process.hrtime.bigint() - start);
    const seconds = diffNs / 1_000_000_000;
    this.metrics.httpRequestsTotal.inc({ method, route, status: String(status) });
    this.metrics.httpRequestDuration.observe({ method, route, status: String(status) }, seconds);
  }
}
