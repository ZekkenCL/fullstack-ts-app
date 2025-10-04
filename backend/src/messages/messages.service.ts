import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

type MessageEntity = Prisma.MessageGetPayload<{}>;
export interface Paginated<T> { page: number; limit: number; total: number; items: T[] }

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

  async remove(id: number): Promise<MessageEntity> {
    return (this.prisma as any).message.delete({ where: { id } });
  }

  async countByChannel(channelId: number): Promise<number> {
    return (this.prisma as any).message.count({ where: { channelId } });
  }
}