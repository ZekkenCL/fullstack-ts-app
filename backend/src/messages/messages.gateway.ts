import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { ReactionsService } from './reactions.service';
import { ChannelsService } from '../channels/channels.service';
import { PresenceService } from '../realtime/presence.service';
import { UseGuards } from '@nestjs/common';
import { WsAuthGuard } from '../realtime/ws-auth.guard';
import { MetricsService } from '../metrics/metrics.service';

interface SendMessagePayload { content: string; channelId: number; clientMsgId?: string; clientSentAt?: number }
interface TypingPayload { channelId: number; typing: boolean }
interface JoinChannelPayload { channelId: number }
interface EditMessagePayload { messageId: number; channelId: number; content: string }
interface DeleteMessagePayload { messageId: number; channelId: number }

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
    private readonly reactions: ReactionsService,
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
    // Debug temporal
    if (!user) console.warn('[WS] sendMessage sin user en socket');
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
      console.warn('[WS] Not member channelId=', payload.channelId, 'user=', user?.id);
      client.emit('error', { message: 'Not a channel member' });
      this.metrics.recordWsError('sendMessage', 'not_member');
      return;
    }
    const start = Date.now();
  const message = await this.messagesService.create({ content: payload.content, channelId: payload.channelId, senderId: user.id });
    const latency = (Date.now() - start) / 1000;
    this.metrics.observeMessageLatency(latency);
    const room = `channel:${payload.channelId}`;
  const enriched = payload.clientMsgId ? { ...message, clientMsgId: payload.clientMsgId, username: user.username } : { ...message, username: user.username };
    if (payload.clientSentAt && typeof payload.clientSentAt === 'number') {
      const rttSeconds = (Date.now() - payload.clientSentAt) / 1000;
      if (rttSeconds >= 0 && rttSeconds < 60) {
        this.metrics.observeClientRoundTrip(rttSeconds);
      }
    }
    // Emit to channel room (other miembros que ya se unieron)
    this.server.to(room).emit('messageReceived', enriched);
    // Detectar menciones (@username) simples y emitir evento directo a usuarios mencionados (sin duplicar notificación para el autor)
    try {
      const mentionRegex = /(^|[^\w`])@([a-zA-Z0-9_\-]{2,32})/g;
      const found = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = mentionRegex.exec(payload.content)) !== null) {
        found.add(match[2].toLowerCase());
      }
      if (found.size > 0) {
        // Obtener miembros del canal y mapear username -> userId
        const memberships = await (this.channelsService as any).prismaClient.channelMember.findMany({
          where: { channelId: payload.channelId },
          select: { userId: true, user: { select: { username: true } } },
        });
        for (const m of memberships) {
          const uname = (m.user.username || '').toLowerCase();
            if (found.has(uname) && m.userId !== user.id) {
              // Emitir evento dirigido al socket(s) del usuario si está conectado
              // Reutilizamos canal general: emitimos evento global 'mention' para que el cliente decida notificar
              this.server.to(room).emit('mentionEventInternal', { channelId: payload.channelId, messageId: (message as any).id, mentionedUserId: m.userId, by: user.id, byUsername: user.username });
            }
        }
      }
    } catch {}
    if (!(client.rooms as Set<string>).has(room)) client.emit('messageReceived', enriched);
    // También emitir un ack directo (evento separado) para que el cliente pueda reconciliar sin depender del broadcast
    client.emit('messageAck', enriched);
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

  @SubscribeMessage('reactionAdd')
  async handleReactionAdd(@ConnectedSocket() client: Socket, @MessageBody() payload: { messageId: number; emoji: string; channelId: number }) {
    const user = (client as any).user;
    if (!user?.id || !payload?.channelId || !payload?.messageId || !payload?.emoji) return;
    try { await this.channelsService.assertMember(payload.channelId, user.id); } catch { return; }
    await this.reactions.addReaction(user.id, payload.messageId, payload.emoji);
    const room = `channel:${payload.channelId}`;
    this.server.to(room).emit('reactionUpdate', { type: 'add', messageId: payload.messageId, emoji: payload.emoji, userId: user.id, username: user.username });
  }

  @SubscribeMessage('reactionRemove')
  async handleReactionRemove(@ConnectedSocket() client: Socket, @MessageBody() payload: { messageId: number; emoji: string; channelId: number }) {
    const user = (client as any).user;
    if (!user?.id || !payload?.channelId || !payload?.messageId || !payload?.emoji) return;
    try { await this.channelsService.assertMember(payload.channelId, user.id); } catch { return; }
    await this.reactions.removeReaction(user.id, payload.messageId, payload.emoji);
    const room = `channel:${payload.channelId}`;
    this.server.to(room).emit('reactionUpdate', { type: 'remove', messageId: payload.messageId, emoji: payload.emoji, userId: user.id, username: user.username });
  }

  @SubscribeMessage('messageEdit')
  async handleMessageEdit(@ConnectedSocket() client: Socket, @MessageBody() payload: EditMessagePayload) {
    const user = (client as any).user;
    if (!user?.id || !payload?.channelId || !payload?.messageId || !payload?.content) return;
    try { await this.channelsService.assertMember(payload.channelId, user.id); } catch { return; }
    try {
      const updated = await this.messagesService.edit(payload.messageId, user.id, payload.content.trim());
      const room = `channel:${payload.channelId}`;
      this.server.to(room).emit('messageUpdated', { ...updated, username: user.username });
    } catch (e: any) {
      client.emit('error', { message: 'Edit failed' });
    }
  }

  @SubscribeMessage('messageDelete')
  async handleMessageDelete(@ConnectedSocket() client: Socket, @MessageBody() payload: DeleteMessagePayload) {
    const user = (client as any).user;
    if (!user?.id || !payload?.channelId || !payload?.messageId) return;
    try { await this.channelsService.assertMember(payload.channelId, user.id); } catch { return; }
    try {
      await this.messagesService.remove(payload.messageId, user.id);
      const room = `channel:${payload.channelId}`;
      this.server.to(room).emit('messageDeleted', { messageId: payload.messageId });
    } catch (e: any) {
      client.emit('error', { message: 'Delete failed' });
    }
  }
}