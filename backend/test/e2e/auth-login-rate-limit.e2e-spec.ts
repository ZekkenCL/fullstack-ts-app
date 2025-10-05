import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDatabase } from './utils/db-reset';
import { createTestingApp } from './utils/create-testing-app';

function parseMetric(text: string, name: string, labels?: Record<string,string>): number | null {
  const lines = text.split(/\n/).filter(l => l.startsWith(name));
  for (const line of lines) {
    if (labels) {
      const matchAll = Object.entries(labels).every(([k,v]) => line.includes(`${k}="${v}"`));
      if (!matchAll) continue;
    }
    const parts = line.trim().split(/\s+/);
    const val = parseFloat(parts[parts.length - 1]);
    if (!isNaN(val)) return val;
  }
  return null;
}

/*
  Login Rate Limit Spec
  - Configura límite = 3 intentos por ventana.
  - Realiza 3 logins válidos (aceptados) y el 4º debe devolver 429.
  - Verifica métricas auth_login_attempts_total (accepted=3, blocked>=1) y auth_login_rate_limited_total (reason=window_exceeded>=1).
*/

describe('E2E Auth Login Rate Limit', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const username = `rl_user_${Date.now()}`;
  const password = 'Passw0rd1';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e_secret';
    process.env.LOGIN_RATE_LIMIT = '3';
    process.env.LOGIN_RATE_WINDOW_SEC = '30';
    const created = await createTestingApp();
    app = created.app;
    prisma = app.get(PrismaService);
    await resetDatabase(prisma as any);
    // Registrar usuario inicial
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces rate limit on /auth/login after 3 attempts', async () => {
    // 3 intentos válidos dentro de la ventana
    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
    }
    // 4º debe bloquearse
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(429);

    // Métricas
    const metricsRes = await request(app.getHttpServer()).get('/metrics').expect(200);
    const body = metricsRes.text;
    const accepted = parseMetric(body, 'auth_login_attempts_total', { result: 'accepted' }) || 0;
    const blocked = parseMetric(body, 'auth_login_attempts_total', { result: 'blocked' }) || 0;
    const rateLimited = parseMetric(body, 'auth_login_rate_limited_total', { reason: 'window_exceeded' }) || 0;

    expect(accepted).toBeGreaterThanOrEqual(3);
    expect(blocked).toBeGreaterThanOrEqual(1);
    expect(rateLimited).toBeGreaterThanOrEqual(1);
  });
});
