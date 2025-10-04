import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { ChannelsService } from '../channels/channels.service';
import { PresenceService } from '../realtime/presence.service';
import { UseGuards } from '@nestjs/common';
import { WsAuthGuard } from '../realtime/ws-auth.guard';

interface SendMessagePayload { content: string; channelId: number }
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
  ) {}

  afterInit(server: Server) {
    console.log('WebSocket Initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const affected = this.presence.leaveSocket(client.id);
    for (const a of affected) {
      this.server.to(`channel:${a.channelId}`).emit('channelPresence', { channelId: a.channelId, users: a.users });
    }
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinChannel')
  handleJoinChannel(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinChannelPayload) {
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
    const user = (client as any).user;
    if (!user?.id) {
      client.emit('error', { message: 'Unauthenticated socket' });
      return;
    }
    if (!payload?.content || !payload.channelId) {
      client.emit('error', { message: 'Invalid payload' });
      return;
    }

    // Rate limiting básico
    const key = `${user.id}:${payload.channelId}`;
    const now = Date.now();
    const windowMs = 3000; // 3s
    const limit = 5;       // máx 5 mensajes/ventana
    const arr = this.messageBuckets.get(key) ?? [];
    const recent = arr.filter(ts => now - ts < windowMs);
    if (recent.length >= limit) {
      client.emit('error', { message: 'Rate limited' });
      return;
    }
    recent.push(now);
    this.messageBuckets.set(key, recent);

    try {
      await this.channelsService.assertMember(payload.channelId, user.id);
    } catch (e) {
      client.emit('error', { message: 'Not a channel member' });
      return;
    }
    const message = await this.messagesService.create({
      content: payload.content,
      channelId: payload.channelId,
      senderId: user.id,
    });
    const room = `channel:${payload.channelId}`;
    this.server.to(room).emit('messageReceived', message);
  }
}