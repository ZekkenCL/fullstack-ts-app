import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { createTestingApp } from './utils/create-testing-app';
import { registerUser, createChannel, joinChannel, randomUsername } from './utils/test-helpers';

describe('Channel messages history (cursor based)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const setup = await createTestingApp();
    app = setup.app; baseUrl = setup.baseUrl;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns latest messages ascending and then older with cursor', async () => {
  const userA = await registerUser(app, randomUsername('ha'), 'Pass123');
    const channel = await createChannel(app, userA.accessToken, 'hist');
    // ensure membership
    await joinChannel(app, userA.accessToken, channel.id);
    // create 65 messages
  for (let i=0;i<65;i++) {
      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ channelId: channel.id, content: 'm'+i })
        .expect(201);
    }
    // first page: limit 50 (should return latest 50 ascending by id)
    const first = await request(app.getHttpServer())
      .get(`/channels/${channel.id}/messages?limit=50`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(first.body.items.length).toBe(50);
    // ascending check
    const ids: number[] = first.body.items.map((m: any) => m.id);
    expect([...ids].sort((a,b)=>a-b)).toEqual(ids);
    expect(first.body.nextCursor).toBeDefined();
    // second page using cursor
    const second = await request(app.getHttpServer())
      .get(`/channels/${channel.id}/messages?limit=30&cursor=${first.body.nextCursor}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(second.body.items.length).toBeGreaterThan(0);
    const secondIds: number[] = second.body.items.map((m: any) => m.id);
    expect([...secondIds].sort((a,b)=>a-b)).toEqual(secondIds);
    // Ensure no overlap between first and second page
    expect(ids.some(id => secondIds.includes(id))).toBe(false);
  }, 40000);

  it('denies access if user not member', async () => {
  const userA = await registerUser(app, randomUsername('hb'), 'Pass123');
  const userB = await registerUser(app, randomUsername('hc'), 'Pass123');
    const channel = await createChannel(app, userA.accessToken, 'restricted');
    // userB did not join
    await request(app.getHttpServer())
      .get(`/channels/${channel.id}/messages`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(403);
  });
});