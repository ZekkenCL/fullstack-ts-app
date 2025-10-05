import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

type MessageEntity = Prisma.MessageGetPayload<{}>;
export interface Paginated<T> { page: number; limit: number; total: number; items: T[] }
export interface ChannelHistoryResult<T> { items: T[]; nextCursor: number | null }

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { content: string; channelId: number; senderId: number }): Promise<MessageEntity> {
    // Centralizar aquí futuras validaciones (existencia de canal, permisos, etc.)
    return (this.prisma as any).message.create({ data });
  }

  async findByChannel(channelId: number, page = 1, limit = 50): Promise<MessageEntity[]> {
    const skip = (page - 1) * limit;
    return (this.prisma as any).message.findMany({ where: { channelId }, orderBy: { id: 'desc' }, skip, take: limit });
  }

  async findAll(page = 1, limit = 50): Promise<MessageEntity[]> {
    const skip = (page - 1) * limit;
    return (this.prisma as any).message.findMany({ orderBy: { id: 'desc' }, skip, take: limit });
  }
  /**
   * Cursor-based history (older messages). Returns ascending order (oldest -> newest)
   * If cursor provided => fetch messages with id < cursor (older).
   * If no cursor => fetch latest page (newest N), then reverse to ascending.
   */
  async channelHistory(channelId: number, limit = 50, cursor?: number): Promise<ChannelHistoryResult<MessageEntity>> {
    const take = Math.min(limit, 100);
    const where: any = { channelId };
    if (cursor) where.id = { lt: cursor };
    const rows: MessageEntity[] = await (this.prisma as any).message.findMany({
      where,
      orderBy: { id: 'desc' },
      take,
    });
    // rows are newest->oldest; reverse to oldest->newest for UI
    const items = [...rows].reverse();
    // next cursor = oldest id if we likely have more (i.e., fetched full page)
    let nextCursor: number | null = null;
    if (rows.length === take) {
      const oldest = rows[rows.length - 1];
      if (oldest) nextCursor = oldest.id;
    }
    return { items, nextCursor };
  }

  async remove(id: number): Promise<MessageEntity> {
    return (this.prisma as any).message.delete({ where: { id } });
  }

  async countByChannel(channelId: number): Promise<number> {
    return (this.prisma as any).message.count({ where: { channelId } });
  }
}