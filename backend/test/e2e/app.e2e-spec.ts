import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { AppModule } from '../../src/app.module';
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

  jest.setTimeout(20000);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e_secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  prisma = app.get(PrismaService);
  // DB cleanup for just-in-case (only users with our suffix)
  await prisma.refreshToken.deleteMany({ where: { user: { username: { contains: `_${suffix}` } } } }).catch(() => {});
  await prisma.channelMember.deleteMany({ where: { user: { username: { contains: `_${suffix}` } } } }).catch(() => {});
  await prisma.message.deleteMany({ where: { sender: { username: { contains: `_${suffix}` } } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { username: { in: [ownerUsername, memberUsername] } } }).catch(() => {});
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('register owner user', async () => {
    const res = await request(app.getHttpServer()).post('/auth/register').send({ username: ownerUsername, password: 'pw' }).expect(201);
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
    const res = await request(app.getHttpServer()).post('/auth/register').send({ username: memberUsername, password: 'pw' }).expect(201);
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
