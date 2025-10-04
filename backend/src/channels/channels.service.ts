import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

type ChannelEntity = Prisma.ChannelGetPayload<{}>;

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return (this.prisma as any).channel.delete({ where: { id } });
  }
}