import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDatabase } from './utils/db-reset';
import { registerUser, createChannel, joinChannel } from './utils/test-helpers';
import { createTestingApp } from './utils/create-testing-app';

function parseMetricCounter(text: string, name: string, labelsMatch?: Record<string,string>): number | null {
  const lines = text.split(/\n/).filter(l => l.startsWith(name));
  for (const l of lines) {
    if (labelsMatch) {
      const allMatch = Object.entries(labelsMatch).every(([k,v]) => l.includes(`${k}="${v}"`));
      if (!allMatch) continue;
    }
    const parts = l.trim().split(' ');
    const val = parseFloat(parts[parts.length - 1]);
    if (!isNaN(val)) return val;
  }
  return null;
}

/*
  Métricas delta:
  - Capturar snapshot de http_requests_total para ruta /channels y ws_events_total sendMessage.
  - Realizar operaciones (crear usuario, canal, join, enviar 2 mensajes via HTTP fallback de API mensajes si existiera, en este caso simular via channel creation + patch) y 2 mensajes vía WS.
  - Verificar incremento.
*/

describe('E2E Metrics Delta', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let channelId: number;
  let baseUrl: string;

  jest.setTimeout(20000);

  beforeAll(async () => {
    const created = await createTestingApp();
    app = created.app;
    baseUrl = created.baseUrl;
    prisma = app.get(PrismaService);
    await resetDatabase(prisma as any);
  });

  afterAll(async () => {
    await app.close();
  });

  it('increments metrics after operations', async () => {
    const snap1 = await request(app.getHttpServer()).get('/metrics').expect(200);
    const beforeChannels = parseMetricCounter(snap1.text, 'http_requests_total', { route: '/channels', method: 'POST', status: '201' }) || 0;
    const beforeWs = parseMetricCounter(snap1.text, 'ws_events_total', { event: 'sendMessage' }) || 0;

    const user = await registerUser(app, 'md_' + Date.now(), 'Passw0rd1');
    accessToken = user.accessToken;
    const channel = await createChannel(app, accessToken, 'metrics');
    channelId = channel.id;

    // Enviar 2 mensajes vía WS para impactar sendMessage (reutilizamos gateway a través de socket.io-client lite inline)
    const { io } = require('socket.io-client');
    await new Promise<void>((resolve, reject) => {
      const s = io(`${baseUrl}?token=${accessToken}`, { transports: ['websocket'], forceNew: true, reconnection: false });
      s.once('connect', () => {
        s.emit('joinChannel', { channelId });
        setTimeout(() => {
          s.emit('sendMessage', { channelId, content: 'm1' });
          s.emit('sendMessage', { channelId, content: 'm2' });
          setTimeout(() => { s.disconnect(); resolve(); }, 150);
        }, 50);
      });
      s.once('connect_error', (e: any) => reject(e));
    });

    // Perform an additional GET on channels to create an extra http request metric
    await request(app.getHttpServer())
      .get('/channels')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const snap2 = await request(app.getHttpServer()).get('/metrics').expect(200);
    const afterChannels = parseMetricCounter(snap2.text, 'http_requests_total', { route: '/channels', method: 'POST', status: '201' }) || 0;
    const afterWs = parseMetricCounter(snap2.text, 'ws_events_total', { event: 'sendMessage' }) || 0;

  expect(afterChannels).toBeGreaterThanOrEqual(beforeChannels + 1); // creación canal (POST)
    expect(afterWs).toBeGreaterThanOrEqual(beforeWs + 2); // dos mensajes
  });
});
