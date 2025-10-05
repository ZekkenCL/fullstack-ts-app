import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { createTestingApp } from './utils/create-testing-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDatabase } from './utils/db-reset';
import { registerUser, createChannel } from './utils/test-helpers';
import { SocketAdapter } from '../../src/realtime/socket.adapter';
import { io, Socket } from 'socket.io-client';

/*
  WebSocket Rate Limiting Spec:
  - Límite configurado (gateway): 5 mensajes por ventana de 3s (user+channel).
  Flujo:
    1. Crear usuario y canal.
    2. Conectar socket autenticado y joinChannel.
    3. Enviar 6 mensajes rápidos -> esperar 5 messageReceived y >=1 evento error con 'Rate limited'.
    4. Esperar ventana (3.1s), enviar 1 mensaje más -> debe aceptarse (messageReceived adicional) sin error.
*/

describe('E2E WebSocket Rate Limit', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let accessToken: string;
  let channelId: number;
  let socket: Socket;

  jest.setTimeout(25000);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e_secret';
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/mydatabase?schema=public';
    }
    const created = await createTestingApp();
    app = created.app;
    baseUrl = created.baseUrl;
    prisma = app.get(PrismaService);
    await resetDatabase(prisma as any);
    const r = await registerUser(app, `rl_${Date.now()}`, 'Passw0rd1');
    accessToken = r.accessToken;
    const ch = await createChannel(app, accessToken, 'rl-channel');
    channelId = ch.id;
  });

  afterAll(async () => {
    if (socket?.connected) socket.disconnect();
    await app.close();
  });

  it('enforces rate limit after 5 messages in <3s window', async () => {
    // Conectar y unir
    await new Promise<void>((resolve, reject) => {
      socket = io(`${baseUrl}?token=${accessToken}`, { transports: ['websocket','polling'], forceNew: true, reconnection: false, timeout: 6000 });
      const timer = setTimeout(() => reject(new Error('Timeout connect')), 6000);
      socket.once('connect_error', (e: any) => { clearTimeout(timer); reject(e); });
      socket.once('connect', () => {
        socket.emit('joinChannel', { channelId });
      });
      socket.once('joinedChannel', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    // Pequeña pausa para asegurar membership/presence
    await new Promise(r => setTimeout(r, 40));

    const received: any[] = [];
    const errors: any[] = [];
    socket.on('messageReceived', (m: any) => { if (m.channelId === channelId) received.push(m); });
    socket.on('error', (e: any) => { if (e?.message === 'Rate limited') errors.push(e); });

    // Enviar 6 mensajes rápido
    for (let i = 0; i < 6; i++) {
      socket.emit('sendMessage', { channelId, content: `m${i}` });
    }

    await new Promise(r => setTimeout(r, 600)); // dar tiempo a procesar

    expect(received.length).toBeGreaterThanOrEqual(5); // los primeros 5
    expect(received.length).toBeLessThanOrEqual(6); // nunca más de 6
    expect(errors.length).toBeGreaterThanOrEqual(1); // al menos un rate limited

    // Esperar ventana para reset
    await new Promise(r => setTimeout(r, 3200));
    const prevCount = received.length;
    socket.emit('sendMessage', { channelId, content: 'after-window' });
    await new Promise(r => setTimeout(r, 150));
    const newCount = received.length;
    expect(newCount).toBe(prevCount + 1); // aceptado tras ventana
  });
});
