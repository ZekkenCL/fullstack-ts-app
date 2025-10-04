import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Gauge, Registry } from 'prom-client';
import Redis from 'ioredis';

@Injectable()
export class MetricsService {
  private readonly registry: Registry;
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly wsConnections: Gauge<string>;
  readonly wsEventsTotal: Counter<string>;
  private redis?: Redis;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total de requests HTTP',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duración de requests HTTP en segundos',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    this.wsConnections = new Gauge({
      name: 'ws_connections',
      help: 'Número actual de conexiones WebSocket',
      labelNames: [],
      registers: [this.registry],
    });
    this.wsEventsTotal = new Counter({
      name: 'ws_events_total',
      help: 'Eventos WebSocket recibidos',
      labelNames: ['event'],
      registers: [this.registry],
    });

    // Inicializar Redis si variables disponibles
    if (process.env.REDIS_HOST) {
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      // Intentar conectar en background
      this.redis.connect().catch(() => {/* ignore for metrics */});
    }
  }

  async getMetrics() {
    return this.registry.metrics();
  }

  incrementWsConnections(delta: number) {
    this.wsConnections.inc(delta);
  }

  incrementWsEvent(event: string) {
    this.wsEventsTotal.inc({ event });
  }

  /**
   * Rate limit basado en Redis (token bucket simple). Devuelve true si permitido.
   */
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!this.redis) return true; // si no hay redis, permitir
    const redisKey = `rl:${key}`;
    const res = await this.redis.multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, 'NX')
      .exec();
    const count = res?.[0]?.[1] as number | undefined;
    if (!count) return true;
    return count <= limit;
  }
}
