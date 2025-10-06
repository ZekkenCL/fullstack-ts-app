import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async addReaction(userId: number, messageId: number, emoji: string) {
    if (!emoji || emoji.length > 50) throw new ForbiddenException('Invalid emoji');
    return (this.prisma as any).reaction.upsert({
      where: { userId_messageId_emoji: { userId, messageId, emoji } },
      update: {},
      create: { userId, messageId, emoji },
    });
  }

  async removeReaction(userId: number, messageId: number, emoji: string) {
    await (this.prisma as any).reaction.delete({ where: { userId_messageId_emoji: { userId, messageId, emoji } } }).catch(()=>null);
    return { removed: true };
  }

  async listForMessage(messageId: number) {
    return (this.prisma as any).reaction.findMany({
      where: { messageId },
      select: { id: true, emoji: true, userId: true, messageId: true, user: { select: { username: true } } },
    });
  }
}
