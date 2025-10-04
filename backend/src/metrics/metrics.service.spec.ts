import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  beforeAll(() => {
    delete process.env.REDIS_HOST; // disable redis for tests
  });

  it('increments ws connections and events', async () => {
    const m = new MetricsService();
    m.incrementWsConnections(1);
    m.incrementWsEvent('joinChannel');
    m.incrementWsEvent('sendMessage');
    m.recordWsError('sendMessage', 'rate_limited');
    m.observeMessageLatency(0.02);
    const txt = await m.getMetrics();
    expect(txt).toContain('ws_connections');
    expect(txt).toContain('ws_events_total');
    expect(txt).toContain('ws_errors_total');
    expect(txt).toContain('ws_message_latency_seconds');
  });

  it('rate limit allows when no redis', async () => {
    const m = new MetricsService();
    const allowed = await m.checkRateLimit('x', 5, 1);
    expect(allowed).toBe(true);
  });
});
