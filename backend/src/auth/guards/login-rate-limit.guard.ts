import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { MetricsService } from '../../metrics/metrics.service';

/* Simple in-memory sliding window rate limit for /auth/login */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private buckets = new Map<string, number[]>();
  private limit = parseInt(process.env.LOGIN_RATE_LIMIT || '5', 10);
  private windowMs = parseInt(process.env.LOGIN_RATE_WINDOW_SEC || '30', 10) * 1000;
  private lastCleanup = Date.now();

  constructor(private readonly metrics: MetricsService) {}

  private cleanup(now: number) {
    // Limpieza ocasional para evitar crecimiento indefinido
    if (now - this.lastCleanup < this.windowMs) return;
    for (const [k, arr] of this.buckets) {
      const filtered = arr.filter(ts => now - ts < this.windowMs);
      if (filtered.length === 0) this.buckets.delete(k); else this.buckets.set(k, filtered);
    }
    this.lastCleanup = now;
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.limit <= 0) return true; // desactivado por config
    const req: any = context.switchToHttp().getRequest();
    if (!req) return true;
    const path = req.route?.path || req.url;
    if (req.method !== 'POST' || !path.includes('/auth/login')) return true;

    const username = req.body?.username || 'unknown';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `${username}|${ip}`;
    const now = Date.now();
    this.cleanup(now);
    const arr = (this.buckets.get(key) || []).filter(ts => now - ts < this.windowMs);
    if (arr.length >= this.limit) {
      this.metrics.incrementLoginAttempt('blocked');
      this.metrics.incrementLoginRateLimited('window_exceeded');
      throw new HttpException('Too many login attempts, try later', HttpStatus.TOO_MANY_REQUESTS);
    }
    arr.push(now);
    this.buckets.set(key, arr);
    this.metrics.incrementLoginAttempt('accepted');
    return true;
  }
}
