import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { createTestingApp } from './utils/create-testing-app';
import { registerUser, createChannel } from './utils/test-helpers';

function extractHistogramCount(text: string, metric: string, labels?: Record<string,string>): number | null {
  const lines = text.split(/\n/).filter(l => l.startsWith(metric));
  // Prom-client exposes _count line for histogram
  const countLine = lines.find(l => l.includes('_count'));
  if (!countLine) return null;
  if (labels) {
    const allMatch = Object.entries(labels).every(([k,v]) => countLine.includes(`${k}="${v}"`));
    if (!allMatch) return null;
  }
  const parts = countLine.trim().split(' ');
  const val = parseFloat(parts[parts.length - 1]);
  return isNaN(val) ? null : val;
}

describe('WS client round trip metric', () => {
  let app: INestApplication; let baseUrl: string; let accessToken: string; let channelId: number;
  jest.setTimeout(15000);
  beforeAll(async () => {
    const created = await createTestingApp();
    app = created.app; baseUrl = created.baseUrl;
    const user = await registerUser(app, 'rtt_' + Date.now(), 'Passw0rd1');
    accessToken = user.accessToken;
    const channel = await createChannel(app, accessToken, 'rtt');
    channelId = channel.id;
  });
  afterAll(async () => { await app.close(); });

  it('increments ws_client_round_trip_seconds histogram count after sendMessage with clientSentAt', async () => {
    const snap1 = await request(app.getHttpServer()).get('/metrics').expect(200);
    const before = extractHistogramCount(snap1.text, 'ws_client_round_trip_seconds');
    const { io } = require('socket.io-client');
    await new Promise<void>((resolve, reject) => {
      const s = io(`${baseUrl}?token=${accessToken}`, { transports: ['websocket'], reconnection: false, forceNew: true });
      s.once('connect', () => {
        s.emit('joinChannel', { channelId });
        setTimeout(() => {
          s.emit('sendMessage', { channelId, content: 'hello rtt', clientMsgId: 'c1', clientSentAt: Date.now() });
          setTimeout(() => { s.disconnect(); resolve(); }, 120);
        }, 40);
      });
      s.once('connect_error', (e: any) => reject(e));
    });
    const snap2 = await request(app.getHttpServer()).get('/metrics').expect(200);
    const after = extractHistogramCount(snap2.text, 'ws_client_round_trip_seconds');
    expect(after).not.toBeNull();
    // if metric didn't exist before it starts at 1, else increments by >=1
    if (before == null) {
      expect(after).toBeGreaterThanOrEqual(1);
    } else {
      expect(after).toBeGreaterThan(before);
    }
  });
});