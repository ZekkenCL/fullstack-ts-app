import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { PresenceService } from '../realtime/presence.service';
import { MetricsService } from '../metrics/metrics.service';

describe('MessagesGateway', () => {
  let gateway: MessagesGateway;
  const messagesService: any = { create: jest.fn(async (d) => ({ id: 1, ...d })) };
  const presence: any = { join: jest.fn(() => []), leaveSocket: jest.fn(() => []) };
  const channelsService: any = { assertMember: jest.fn(() => Promise.resolve(true)) };
  const metrics: any = {
    incrementWsConnections: jest.fn(),
    incrementWsEvent: jest.fn(),
    recordWsError: jest.fn(),
    observeMessageLatency: jest.fn(),
    checkRateLimit: jest.fn(async () => true),
  };

  beforeEach(() => {
  gateway = new MessagesGateway(messagesService as MessagesService, presence as PresenceService, channelsService as any, metrics as MetricsService);
    (gateway as any).server = { to: () => ({ emit: () => {} }), emit: () => {} } as any; // minimal mock
  });

  afterEach(() => jest.clearAllMocks());

  it('rejects unauthenticated sendMessage', async () => {
    const client: any = { emit: jest.fn() };
    await gateway.handleSendMessage(client, { content: 'hola', channelId: 1 });
    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Unauthenticated socket' }));
  });

  it('accepts valid sendMessage', async () => {
    const client: any = { emit: jest.fn(), user: { id: 2, username: 'u' } };
    await gateway.handleSendMessage(client, { content: 'hola', channelId: 3 });
    expect(messagesService.create).toHaveBeenCalled();
    expect(metrics.observeMessageLatency).toHaveBeenCalled();
  });

  it('rate limits when metrics check fails', async () => {
    metrics.checkRateLimit.mockResolvedValueOnce(false);
    const client: any = { emit: jest.fn(), user: { id: 2 } };
    await gateway.handleSendMessage(client, { content: 'hola', channelId: 3 });
    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Rate limited' }));
  });
});
