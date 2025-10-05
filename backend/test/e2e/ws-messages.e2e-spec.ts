import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDatabase } from './utils/db-reset';
import { io, Socket } from 'socket.io-client';
import { createTestingApp } from './utils/create-testing-app';

/*
  WebSocket E2E:
  1. Registrar usuario y crear canal via HTTP.
  2. Conectar socket autenticado (query token).
  3. joinChannel -> esperar 'joinedChannel' y 'channelPresence'.
  4. sendMessage -> esperar 'messageReceived' con contenido.
  5. GET /metrics y asegurar que los contadores ws_events_total y ws_message_latency_seconds aparecieron.
*/

describe('E2E WebSocket Messages', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let server: any;
  let accessToken: string;
  let channelId: number;
  let socket: Socket;
  const username = `ws_user_${Date.now()}`;
  const password = 'Passw0rd1';

  jest.setTimeout(20000);

  beforeAll(async () => {
    const created = await createTestingApp();
    app = created.app;
    baseUrl = created.baseUrl;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (socket && socket.connected) socket.disconnect();
    await app.close();
  });

  it('register user & create channel', async () => {
    await resetDatabase(prisma as any);
    const reg = await request(app.getHttpServer()).post('/auth/register').send({ username, password }).expect(201);
    accessToken = reg.body.accessToken;
    const ch = await request(app.getHttpServer()).post('/channels').set('Authorization', `Bearer ${accessToken}`).send({ name: 'ws-general' }).expect(201);
    channelId = ch.body.id;
    expect(channelId).toBeGreaterThan(0);
  });

  it('connect socket and join channel then send message', async () => {
    const errorEvents: any[] = [];
    await new Promise<void>((resolve, reject) => {
      const urlWithToken = `${baseUrl}?token=${accessToken}`;
      socket = io(urlWithToken, {
        transports: ['websocket', 'polling'],
        timeout: 7000,
        forceNew: true,
        reconnection: false,
      });
      const timers: NodeJS.Timeout[] = [];
      const cleanup = () => timers.forEach(t => clearTimeout(t));
  socket.on('connect_error', (err: any) => { console.error('connect_error', err?.message || err); cleanup(); reject(err); });
  socket.on('error', (e) => { errorEvents.push(e); });
      socket.on('connect', () => {
        socket.emit('joinChannel', { channelId });
      });
      let joined = false;
      let messageSent = false;
      // (removed verbose onAny debug logging)
      socket.on('joinedChannel', async (p: any) => {
        if (p?.room && !messageSent) {
          joined = true;
          await new Promise(r => setTimeout(r, 30));
          messageSent = true;
          socket.emit('sendMessage', { channelId, content: 'hola ws' });
        }
      });
    socket.on('error', (_e: any) => { /* already captured above */ });
      socket.on('channelPresence', async (_p: any) => { /* presence observed but we now act after joinedChannel */ });
      socket.on('messageReceived', (msg: any) => {
        try {
          expect(msg.content).toBe('hola ws');
          expect(msg.channelId).toBe(channelId);
          expect(errorEvents).toHaveLength(0);
          cleanup();
          resolve();
        } catch (e) { cleanup(); reject(e); }
      });
      timers.push(setTimeout(() => reject(new Error('Timeout waiting for messageReceived')), 7000));
    });
  });

  it('metrics endpoint reflects websocket activity', async () => {
    // pequeño delay para que prom-client procese
    await new Promise(r => setTimeout(r, 150));
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    const body: string = res.text;
    expect(body).toContain('ws_events_total');
    expect(body).toContain('sendMessage');
    // basta con el nombre base del histograma (los buckets pueden variar)
    expect(body).toContain('ws_message_latency_seconds');
  });
});
