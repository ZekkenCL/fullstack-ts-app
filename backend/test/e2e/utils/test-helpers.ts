import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

export interface RegisterResult { accessToken: string; refreshToken: string; username: string }

export async function registerUser(app: INestApplication, username: string, password: string): Promise<RegisterResult> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ username, password })
    .expect(201);
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, username };
}

export async function loginUser(app: INestApplication, username: string, password: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password })
    .expect(201);
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

export async function createChannel(app: INestApplication, accessToken: string, name: string) {
  const res = await request(app.getHttpServer())
    .post('/channels')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name })
    .expect(201);
  return res.body;
}

export async function joinChannel(app: INestApplication, accessToken: string, channelId: number) {
  await request(app.getHttpServer())
    .post(`/channels/${channelId}/join`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(201);
}

export function randomUsername(prefix = 'user') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
}
