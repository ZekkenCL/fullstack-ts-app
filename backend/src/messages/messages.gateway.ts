import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { ChannelsService } from '../channels/channels.service';
import { PresenceService } from '../realtime/presence.service';
import { UseGuards } from '@nestjs/common';
import { WsAuthGuard } from '../realtime/ws-auth.guard';
import { MetricsService } from '../metrics/metrics.service';

interface SendMessagePayload { content: string; channelId: number; clientMsgId?: string }
interface TypingPayload { channelId: number; typing: boolean }
interface JoinChannelPayload { channelId: number }

@WebSocketGateway()
@UseGuards(WsAuthGuard)
export class MessagesGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  // Rate limiting sencillo en memoria: clave userId:channelId -> timestamps
  private messageBuckets = new Map<string, number[]>();

  constructor(
    private readonly messagesService: MessagesService,
    private readonly presence: PresenceService,
    private readonly channelsService: ChannelsService,
    private readonly metrics: MetricsService,
  ) {}

  afterInit(server: Server) {
    console.log('WebSocket Initialized');
  }

  handleConnection(client: Socket) {
    this.metrics.incrementWsConnections(1);
    // console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const affected = this.presence.leaveSocket(client.id);
    for (const a of affected) {
      this.server.to(`channel:${a.channelId}`).emit('channelPresence', { channelId: a.channelId, users: a.users });
    }
    this.metrics.incrementWsConnections(-1);
  }

  @SubscribeMessage('joinChannel')
  handleJoinChannel(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinChannelPayload) {
    this.metrics.incrementWsEvent('joinChannel');
    if (!payload?.channelId) return;
    const room = `channel:${payload.channelId}`;
    client.join(room);
    const user = (client as any).user;
    if (user) {
      // membership check (ignore error -> emit)
      this.channelsService.assertMember(payload.channelId, user.id).catch(() => {
        client.emit('error', { message: 'Not a channel member' });
        client.leave(room);
        return;
      });
      const users = this.presence.join(client.id, user.id, user.username, payload.channelId);
      this.server.to(room).emit('channelPresence', { channelId: payload.channelId, users });
    }
    client.emit('joinedChannel', { room });
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: SendMessagePayload) {
    this.metrics.incrementWsEvent('sendMessage');
    const user = (client as any).user;
    if (!user?.id) {
      client.emit('error', { message: 'Unauthenticated socket' });
      this.metrics.recordWsError('sendMessage', 'unauthenticated');
      return;
    }
    if (!payload?.content || !payload.channelId) {
      client.emit('error', { message: 'Invalid payload' });
      this.metrics.recordWsError('sendMessage', 'invalid_payload');
      return;
    }

    // Rate limiting (Redis si existe, fallback in-memory)
    const key = `${user.id}:${payload.channelId}`;
    const windowMs = 3000; // 3s window
    const limit = 5;       // máx 5 mensajes/ventana
    const allowed = await this.metrics.checkRateLimit(`msg:${key}`, limit, windowMs / 1000);
    if (!allowed) {
      client.emit('error', { message: 'Rate limited' });
      this.metrics.recordWsError('sendMessage', 'rate_limited');
      return;
    }
    if (!this.metrics['redis']) { // fallback local solo si no hay redis
      const now = Date.now();
      const arr = this.messageBuckets.get(key) ?? [];
      const recent = arr.filter(ts => now - ts < windowMs);
      if (recent.length >= limit) {
        client.emit('error', { message: 'Rate limited' });
        return;
      }
      recent.push(now);
      this.messageBuckets.set(key, recent);
    }

    try {
      await this.channelsService.assertMember(payload.channelId, user.id);
    } catch (e) {
      client.emit('error', { message: 'Not a channel member' });
      this.metrics.recordWsError('sendMessage', 'not_member');
      return;
    }
    const start = Date.now();
  const message = await this.messagesService.create({ content: payload.content, channelId: payload.channelId, senderId: user.id });
    const latency = (Date.now() - start) / 1000;
    this.metrics.observeMessageLatency(latency);
    const room = `channel:${payload.channelId}`;
    const enriched = payload.clientMsgId ? { ...message, clientMsgId: payload.clientMsgId } : message;
    this.server.to(room).emit('messageReceived', enriched);
  }

  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() payload: TypingPayload) {
    this.metrics.incrementWsEvent('typing');
    const user = (client as any).user;
    if (!user?.id || !payload?.channelId) return;
    // membership check (silent fail)
    try {
      await this.channelsService.assertMember(payload.channelId, user.id);
    } catch { return; }
    const room = `channel:${payload.channelId}`;
    this.server.to(room).emit('channelTyping', { channelId: payload.channelId, userId: user.id, username: user.username, typing: payload.typing });
  }
}