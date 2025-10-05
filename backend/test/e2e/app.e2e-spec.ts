import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { AppModule } from '../../src/app.module';
import { resetDatabase } from './utils/db-reset';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('E2E Basic (Auth + Channels + Roles)', () => {
  let app: INestApplication;
  let accessTokenOwner: string;
  let accessTokenMember: string;
  let channelId: number;
  let prisma: PrismaService;
  const suffix = Date.now();
  const ownerUsername = `owner_${suffix}`;
  const memberUsername = `member_${suffix}`;
  const validPassword = 'Passw0rd1';

  jest.setTimeout(20000);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e_secret';
    if (!process.env.DATABASE_URL) {
      // fallback to docker-compose defaults
      process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/mydatabase?schema=public';
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    // Clean DB to isolate spec
    prisma = app.get(PrismaService);
    await resetDatabase(prisma as any);
    // prisma already set
  });

  afterAll(async () => {
    await app.close();
  });

  it('register owner user', async () => {
  const res = await request(app.getHttpServer()).post('/auth/register').send({ username: ownerUsername, password: validPassword }).expect(201);
    accessTokenOwner = res.body.accessToken;
    expect(accessTokenOwner).toBeDefined();
  });

  it('create channel as owner', async () => {
    const res = await request(app.getHttpServer())
      .post('/channels')
      .set('Authorization', `Bearer ${accessTokenOwner}`)
      .send({ name: 'general' })
      .expect(201);
    channelId = res.body.id;
    expect(channelId).toBeGreaterThan(0);
  });

  it('register second user', async () => {
  const res = await request(app.getHttpServer()).post('/auth/register').send({ username: memberUsername, password: validPassword }).expect(201);
    accessTokenMember = res.body.accessToken;
  });

  it('member joins channel', async () => {
    await request(app.getHttpServer())
      .post(`/channels/${channelId}/join`)
      .set('Authorization', `Bearer ${accessTokenMember}`)
      .expect(201);
  });

  it('member cannot patch channel (forbidden)', async () => {
    await request(app.getHttpServer())
      .patch(`/channels/${channelId}`)
      .set('Authorization', `Bearer ${accessTokenMember}`)
      .send({ name: 'hack' })
      .expect(403);
  });

  it('owner can patch channel', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/channels/${channelId}`)
      .set('Authorization', `Bearer ${accessTokenOwner}`)
      .send({ name: 'renamed' })
      .expect(200);
    expect(res.body.name).toBe('renamed');
  });
});
