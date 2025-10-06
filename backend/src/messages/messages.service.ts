import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

type MessageEntity = Prisma.MessageGetPayload<{}>;
export interface Paginated<T> { page: number; limit: number; total: number; items: T[] }
export interface ChannelHistoryResult<T> { items: T[]; nextCursor: number | null }

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { content: string; channelId: number; senderId: number }): Promise<any> {
    return (this.prisma as any).message.create({
      data,
      include: { sender: { select: { id: true, username: true, avatarUrl: true } } }
    });
  }

  async edit(id: number, userId: number, content: string): Promise<MessageEntity> {
    // Verificar autoría
    const existing = await (this.prisma as any).message.findUnique({ where: { id } });
    if (!existing) throw new Error('Message not found');
    if (existing.senderId !== userId) throw new Error('Forbidden');
    return (this.prisma as any).message.update({ where: { id }, data: { content, updatedAt: new Date() } });
  }

  async findByChannel(channelId: number, page = 1, limit = 50): Promise<any[]> {
    const skip = (page - 1) * limit;
    return (this.prisma as any).message.findMany({
      where: { channelId },
      orderBy: { id: 'desc' },
      skip,
      take: limit,
      include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
    });
  }

  async findAll(page = 1, limit = 50): Promise<any[]> {
    const skip = (page - 1) * limit;
    return (this.prisma as any).message.findMany({
      orderBy: { id: 'desc' },
      skip,
      take: limit,
      include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
    });
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
    const rows: any[] = await (this.prisma as any).message.findMany({
      where,
      orderBy: { id: 'desc' },
      take,
      include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
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

  /** Simple ILIKE search inside a channel with cursor (id < cursor) ordering newest->oldest then reversed */
  async searchInChannel(channelId: number, query: string, limit = 30, cursor?: number): Promise<ChannelHistoryResult<any>> {
    const take = Math.min(limit, 100);
    const q = query.trim();
    if (!q) return { items: [], nextCursor: null };
    // Fallback to simple contains for very short tokens (< 3 chars) to avoid useless tsquery overhead
    if (q.length < 3) {
      const where: any = { channelId, content: { contains: q, mode: 'insensitive' } };
      if (cursor) where.id = { lt: cursor };
      const rows: any[] = await (this.prisma as any).message.findMany({
        where,
        orderBy: { id: 'desc' },
        take,
        include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
      });
      const items = [...rows].reverse();
      let nextCursor: number | null = null;
      if (rows.length === take) {
        const oldest = rows[rows.length - 1];
        if (oldest) nextCursor = oldest.id;
      }
      return { items, nextCursor };
    }
    // Use plainto_tsquery for safer parsing; language spanish (matches migration) else fallback english
    const tsQueryParam = q;
    const cursorClause = cursor ? 'AND m.id < $3' : '';
    const params: any[] = [channelId, tsQueryParam];
    if (cursor) params.push(cursor);
    const raw: any[] = await (this.prisma as any).$queryRawUnsafe(
      `SELECT m.*, ts_headline('spanish', m.content, plainto_tsquery('spanish', $2), 'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,ShortWord=2,FragmentDelimiter= … ') as highlight
       FROM "Message" m
       WHERE m.channelId = $1
         AND m.content_tsv @@ plainto_tsquery('spanish', $2)
         ${cursorClause}
       ORDER BY m.id DESC
       LIMIT ${take}`,
      ...params
    );
    const rows: MessageEntity[] = raw as any;
    const items = [...rows].reverse();
    let nextCursor: number | null = null;
    if (rows.length === take) {
      const oldest = rows[rows.length - 1];
      if (oldest) nextCursor = (oldest as any).id;
    }
    return { items, nextCursor };
  }

  async remove(id: number, userId: number): Promise<MessageEntity> {
    const existing = await (this.prisma as any).message.findUnique({ where: { id } });
    if (!existing) throw new Error('Message not found');
    if (existing.senderId !== userId) throw new Error('Forbidden');
    return (this.prisma as any).message.delete({ where: { id } });
  }

  /** Global multi-channel search restricted to user channel memberships */
  async globalSearch(userId: number, query: string, limit = 40, cursor?: number): Promise<ChannelHistoryResult<any>> {
    const take = Math.min(limit, 100);
    const q = query.trim();
    if (!q) return { items: [], nextCursor: null };
    // Get channelIds where user is member
    const memberships = await (this.prisma as any).channelMember.findMany({ where: { userId }, select: { channelId: true } });
    if (memberships.length === 0) return { items: [], nextCursor: null };
    const ids = memberships.map((m: any) => m.channelId);
    const cursorClause = cursor ? 'AND m.id < $3' : '';
    const params: any[] = [ids, q];
    if (cursor) params.push(cursor);
    const raw: any[] = await (this.prisma as any).$queryRawUnsafe(
      `SELECT m.*, ts_headline('spanish', m.content, plainto_tsquery('spanish', $2), 'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,ShortWord=2,FragmentDelimiter= … ') as highlight
       FROM "Message" m
       WHERE m.channelId = ANY($1::int[])
         AND m.content_tsv @@ plainto_tsquery('spanish', $2)
         ${cursorClause}
       ORDER BY m.id DESC
       LIMIT ${take}`,
      ...params
    );
    const rows = raw as MessageEntity[];
    const items = [...rows].reverse(); // ascending
    let nextCursor: number | null = null;
    if (rows.length === take) {
      const oldest = rows[rows.length - 1];
      if (oldest) nextCursor = (oldest as any).id;
    }
    return { items, nextCursor };
  }

  async countByChannel(channelId: number): Promise<number> {
    return (this.prisma as any).message.count({ where: { channelId } });
  }
}