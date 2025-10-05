import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { MetricsService } from '../../metrics/metrics.service';

interface BucketInfo { timestamps: number[] }

/* Simple in-memory sliding window rate limit for /auth/login
 * Defaults: 5 attempts / 30s per (username|ip). Use env overrides:
 *  LOGIN_RATE_LIMIT=5
 *  LOGIN_RATE_WINDOW_SEC=30
 * On exceed: increments counter metric and throws 429.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private buckets = new Map<string, BucketInfo>();
  private attemptsCounterCreated = false;
  private limit = parseInt(process.env.LOGIN_RATE_LIMIT || '5', 10);
  private windowMs = (parseInt(process.env.LOGIN_RATE_WINDOW_SEC || '30', 10)) * 1000;

  constructor(private readonly metrics: MetricsService) {}

  private ensureMetric() {
    if (this.attemptsCounterCreated) return;
    // Reutilizamos registry existente: añadimos dinámicamente sólo una vez
    if (!(this.metrics as any)['authLoginAttempts']) {
      const { Counter } = require('prom-client');
      (this.metrics as any)['authLoginAttempts'] = new Counter({
        name: 'auth_login_attempts_total',
        help: 'Intentos de login (incluyendo bloqueados)',
        labelNames: ['result'],
        registers: [(this.metrics as any)['registry'] || (this.metrics as any)['registry_']].filter(Boolean),
      });
    }
    if (!(this.metrics as any)['authLoginRateLimited']) {
      const { Counter } = require('prom-client');
      (this.metrics as any)['authLoginRateLimited'] = new Counter({
        name: 'auth_login_rate_limited_total',
        help: 'Intentos bloqueados por rate limit',
        labelNames: ['reason'],
        registers: [(this.metrics as any)['registry'] || (this.metrics as any)['registry_']].filter(Boolean),
      });
    }
    this.attemptsCounterCreated = true;
  }

  canActivate(context: ExecutionContext): boolean {
    this.ensureMetric();
    const http = context.switchToHttp();
    const req: any = http.getRequest();
    if (!req) return true;
    // Only apply to POST /auth/login
    const path = req.route?.path || req.url;
    if (req.method !== 'POST' || !path?.includes('/auth/login')) return true;

    const username = req.body?.username || 'unknown';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `${username}|${ip}`;
    const now = Date.now();
    const bucket = this.buckets.get(key) || { timestamps: [] };
    // purge old
    bucket.timestamps = bucket.timestamps.filter(ts => now - ts < this.windowMs);
    if (bucket.timestamps.length >= this.limit) {
      (this.metrics as any)['authLoginAttempts'].inc({ result: 'blocked' });
      (this.metrics as any)['authLoginRateLimited'].inc({ reason: 'window_exceeded' });
  throw new HttpException('Too many login attempts, try later', HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);
    (this.metrics as any)['authLoginAttempts'].inc({ result: 'accepted' });
    return true;
  }
}
