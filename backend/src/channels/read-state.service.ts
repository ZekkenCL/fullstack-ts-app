import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReadStateService {
  constructor(private readonly prisma: PrismaService) {}

  upsert(userId: number, channelId: number, lastReadMessageId: number | null) {
    return (this.prisma as any).channelReadState.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, lastReadMessageId: lastReadMessageId ?? undefined },
      update: { lastReadMessageId },
    });
  }

  find(userId: number, channelId: number) {
    return (this.prisma as any).channelReadState.findUnique({ where: { userId_channelId: { userId, channelId } } });
  }

  async unreadCount(userId: number, channelId: number) {
    const state = await this.find(userId, channelId);
    const lastId = state?.lastReadMessageId || 0;
    const count = await (this.prisma as any).message.count({ where: { channelId, id: { gt: lastId } } });
    return count;
  }

  async unreadForUser(userId: number) {
    // Return map of channelId -> unread
    const channels = await (this.prisma as any).channelMember.findMany({ where: { userId }, select: { channelId: true } });
    const result: Record<number, number> = {};
    for (const c of channels) {
      result[c.channelId] = await this.unreadCount(userId, c.channelId);
    }
    return result;
  }
}
