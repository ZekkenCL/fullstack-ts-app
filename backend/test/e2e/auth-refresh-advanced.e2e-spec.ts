import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { createTestingApp } from './utils/create-testing-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDatabase } from './utils/db-reset';
import { registerUser, loginUser, randomUsername } from './utils/test-helpers';

/*
  Advanced Refresh Token scenarios:
  1. Expired token: forzar expiresAt pasado -> /auth/refresh => 403.
  2. Logout revoca todos: tras /auth/logout, refresh falha 403.
  3. Token manipulado (bit flip) => 403.
*/

describe('E2E Auth Refresh Advanced', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const password = 'Passw0rd1';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e_secret';
    process.env.REFRESH_TOKEN_TTL_DAYS = '7';
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/mydatabase?schema=public';
    }
  const created = await createTestingApp();
  app = created.app;
  prisma = app.get(PrismaService);
    await resetDatabase(prisma as any);
  });

  afterAll(async () => {
    await app.close();
  });

  it('expired refresh token cannot rotate', async () => {
    const username = randomUsername('exp');
    const { refreshToken } = await registerUser(app, username, password);
    const tokenId = refreshToken.split('.')[0];
    // Forzar expirado
    await (prisma as any).refreshToken.update({ where: { tokenId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(403);
  });

  it('logout revokes all active tokens', async () => {
    const username = randomUsername('logout');
    const first = await registerUser(app, username, password);
    // rotate para tener 2 activos (antes de logout)
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(201);
    const secondRefresh = rotated.body.refreshToken;
    // logout
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(201);
    // ambos tokens ya revocados
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: secondRefresh })
      .expect(403);
  });

  it('manipulated refresh token is rejected', async () => {
    const username = randomUsername('tamper');
    const { refreshToken } = await registerUser(app, username, password);
    // Flip último caracter (si es = usar X, etc.)
    const tampered = refreshToken.slice(0, -1) + (refreshToken.slice(-1) === 'a' ? 'b' : 'a');
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tampered })
      .expect(403);
  });
});
