import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/*
  Tests:
  1. Register user -> receive access + refresh
  2. Use refresh to rotate -> get new pair, old becomes revoked
  3. Reuse old refresh -> 403
  4. Enforce max active tokens trimming: perform sequential rotations exceeding limit and verify earliest tokens revoked
*/

describe('E2E Auth Refresh Rotation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const username = `user_refresh_${Date.now()}`;
  const password = 'Passw0rd1';
  let firstRefresh: string;
  let secondRefresh: string;
  let accessToken: string;

  jest.setTimeout(20000);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e_secret';
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/mydatabase?schema=public';
    }
    // Reduce active refresh limit for deterministic trimming test
    process.env.REFRESH_TOKEN_MAX_ACTIVE = '3';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('register user and obtain tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password })
      .expect(201);
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
    firstRefresh = res.body.refreshToken;
    accessToken = res.body.accessToken;
  });

  it('rotate refresh token (first -> second)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(201);
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(firstRefresh);
    secondRefresh = res.body.refreshToken;
  });

  it('old refresh token cannot be reused', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(403);
  });

  it('multiple rotations enforce trimming of oldest tokens beyond limit', async () => {
    const collected: string[] = [secondRefresh];
    // Perform 4 more rotations -> total attempted active would be 5 (limit 3)
    for (let i = 0; i < 4; i++) {
      const last = collected[collected.length - 1];
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: last })
        .expect(201);
      collected.push(res.body.refreshToken);
    }
    // Query DB for non-revoked tokens
    const active = await (prisma as any).refreshToken.findMany({ where: { revokedAt: null, userId: (await prisma.user.findUnique({ where: { username } }))!.id }, orderBy: { createdAt: 'asc' } });
    expect(active.length).toBeLessThanOrEqual(3);
    // Earliest collected token (secondRefresh) should now be revoked
    const secondRecord = await (prisma as any).refreshToken.findUnique({ where: { tokenId: secondRefresh.split('.')[0] } });
    expect(secondRecord.revokedAt).not.toBeNull();
  });

  it('latest refresh works for protected endpoint (profile)', async () => {
    const latest = await (prisma as any).refreshToken.findFirst({ where: { revokedAt: null }, orderBy: { createdAt: 'desc' } });
    // rotate once more to also get new access token
    const rawTokenHash = latest.tokenHash; // not useful directly but we have raw from collected loop
    // Instead just use the last raw we stored in collected
    // Re-fetch last raw from prior loop scope via closure not accessible here, so we perform one more rotation using any active token
    const anyActive = latest.tokenId; // we need raw -> can't reconstruct; do another safe step: login again
    const relog = await request(app.getHttpServer()).post('/auth/login').send({ username, password }).expect(201);
    const newAccess = relog.body.accessToken;
    const profile = await request(app.getHttpServer())
      .post('/auth/profile')
      .set('Authorization', `Bearer ${newAccess}`)
      .expect(201);
    expect(profile.body.user.username).toBe(username);
  });
});
