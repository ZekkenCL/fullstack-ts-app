import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

type ChannelEntity = Prisma.ChannelGetPayload<{}>;

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  // Expose prisma for guards (read-only usage)
  get prismaClient() {
    return this.prisma as any;
  }

  async create(data: { name: string; creatorId?: number }): Promise<ChannelEntity> {
    // Create channel and (optionally) membership in a transaction
    if (data.creatorId) {
      const result = await (this.prisma as any).$transaction(async (tx: any) => {
        const channel = await tx.channel.create({ data: { name: data.name } });
        await tx.channelMember.create({ data: { userId: data.creatorId, channelId: channel.id, role: 'owner' } });
        return channel;
      });
      return result;
    }
    return (this.prisma as any).channel.create({ data: { name: data.name } });
  }

  async findAll(): Promise<ChannelEntity[]> {
    return (this.prisma as any).channel.findMany();
  }

  async findOne(id: number): Promise<ChannelEntity | null> {
    return (this.prisma as any).channel.findUnique({ where: { id } });
  }

  async assertMember(channelId: number, userId: number) {
  const member = await (this.prisma as any).channelMember.findUnique({ where: { userId_channelId: { userId, channelId } } });
    if (!member) throw new ForbiddenException('Not a channel member');
    return member;
  }

  async findMembership(channelId: number, userId: number) {
    return (this.prisma as any).channelMember.findUnique({ where: { userId_channelId: { userId, channelId } } });
  }

  async join(channelId: number, userId: number) {
    // Ensure channel exists
    const channel = await this.findOne(channelId);
    if (!channel) throw new NotFoundException('Channel not found');
    return (this.prisma as any).channelMember.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: {},
      create: { userId, channelId, role: 'member' },
    });
  }

  async leave(channelId: number, userId: number) {
    return (this.prisma as any).channelMember.delete({ where: { userId_channelId: { userId, channelId } } }).catch(() => null);
  }

  async update(id: number, data: Partial<{ name: string }>): Promise<ChannelEntity> {
    return (this.prisma as any).channel.update({ where: { id }, data });
  }

  async remove(id: number): Promise<ChannelEntity> {
    // Cascade delete manually (Prisma referential actions not configured)
    return (this.prisma as any).$transaction(async (tx: any) => {
      // Delete reactions of messages in channel
      await tx.reaction.deleteMany({ where: { message: { channelId: id } } }).catch(()=>{});
      // Delete read states referencing channel
      await tx.channelReadState.deleteMany({ where: { channelId: id } }).catch(()=>{});
      // Delete messages
      await tx.message.deleteMany({ where: { channelId: id } }).catch(()=>{});
      // Delete memberships
      await tx.channelMember.deleteMany({ where: { channelId: id } }).catch(()=>{});
      // Finally delete channel
      return tx.channel.delete({ where: { id } });
    });
  }

  /** List members of a channel (for mentions). Optionally filter by username prefix (case-insensitive). */
  async listMembers(channelId: number, q?: string, limit = 20) {
    const where: any = { channelId };
    if (q && q.trim()) {
      where.user = { username: { startsWith: q.trim(), mode: 'insensitive' } };
    }
    const rows = await (this.prisma as any).channelMember.findMany({
      where,
      select: { userId: true, role: true, user: { select: { id: true, username: true } } },
      orderBy: { user: { username: 'asc' } },
      take: Math.min(Math.max(limit, 1), 50),
    });
    return rows.map((r: any) => ({ id: r.user.id, username: r.user.username, role: r.role }));
  }
}