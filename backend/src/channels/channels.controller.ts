import { Controller, Get, Post, Body, Param, Patch, Delete, ParseIntPipe, UseGuards, Req, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { MessagesService, ChannelHistoryResult } from '../messages/messages.service';
import { ReadStateService } from './read-state.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChannelRole } from './channel-role.decorator';
import { ChannelRoleGuard } from './channel-role.guard';
import { Prisma } from '@prisma/client';

type ChannelEntity = Prisma.ChannelGetPayload<{}>;

@ApiTags('channels')
@ApiBearerAuth()
@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly messagesService: MessagesService,
    private readonly readState: ReadStateService,
  ) {}

  @Get()
  async getAllChannels(@Req() req: any): Promise<(ChannelEntity & { unread?: number; myRole?: string; muted?: boolean; notificationsEnabled?: boolean })[]> {
    const channels = await this.channelsService.findAll();
    const userId = req.user?.id;
    if (!userId) return channels;
    // For each channel membership compute unread (naive N+1; could batch optimize later)
  const enriched: (ChannelEntity & { unread?: number; myRole?: string; muted?: boolean; notificationsEnabled?: boolean })[] = [];
    for (const c of channels) {
      try {
        const member = await this.channelsService.assertMember(c.id, userId);
        const unread = await this.readState.unreadCount(userId, c.id);
        enriched.push({ ...c, unread, myRole: member.role, muted: (member as any).muted, notificationsEnabled: (member as any).notificationsEnabled });
      } catch {
        enriched.push(c as any);
      }
    }
    return enriched;
  }

  @Get('unreads/aggregate')
  async aggregatedUnreads(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) return [];
    // Fetch memberships, their last read state, and latest message id per channel
    const memberships = await (this.channelsService as any).prismaClient.channelMember.findMany({
      where: { userId },
      select: { channelId: true },
    });
    if (memberships.length === 0) return [];
    const channelIds = memberships.map((m: any) => m.channelId);
    const readStates = await (this.channelsService as any).prismaClient.channelReadState.findMany({
      where: { userId, channelId: { in: channelIds } },
      select: { channelId: true, lastReadMessageId: true },
    });
    const latestMessages = await (this.channelsService as any).prismaClient.message.groupBy({
      by: ['channelId'],
      where: { channelId: { in: channelIds } },
      _max: { id: true },
    });
    // Build map for fast lookup
    const readMap = new Map<number, number | null>();
    readStates.forEach((r: any) => readMap.set(r.channelId, r.lastReadMessageId));
    const result: { channelId: number; lastReadMessageId: number | null; unread: number }[] = [];
    for (const lm of latestMessages) {
      const channelId = lm.channelId as number;
      const latestId = (lm as any)._max.id as number | null;
      const lastRead = readMap.has(channelId) ? (readMap.get(channelId) || null) : null;
      let unread = 0;
      if (latestId) {
        if (!lastRead) {
          // Count all messages
          unread = await (this.channelsService as any).prismaClient.message.count({ where: { channelId } });
        } else if (lastRead < latestId) {
          unread = await (this.channelsService as any).prismaClient.message.count({ where: { channelId, id: { gt: lastRead } } });
        }
      }
      result.push({ channelId, lastReadMessageId: lastRead, unread });
    }
    return result;
  }

  @Get(':id')
  async getChannelById(@Param('id', ParseIntPipe) id: number): Promise<ChannelEntity | null> {
    return this.channelsService.findOne(id);
  }

  @Get(':id/messages')
  async getChannelMessages(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Req() req?: any
  ): Promise<ChannelHistoryResult<any>> {
    // membership enforcement
    await this.channelsService.assertMember(id, req.user.id);
    const lim = Math.max(1, Math.min(parseInt(limit || '50', 10) || 50, 100));
    const cur = cursor ? parseInt(cursor, 10) : undefined;
    const history = await this.messagesService.channelHistory(id, lim, cur);
    if (history.items.length > 0) {
      const ids = history.items.map((m: any) => m.id).filter((v: any) => typeof v === 'number');
      if (ids.length) {
        const reactions = await (this.channelsService as any).prismaClient.reaction.findMany({
          where: { messageId: { in: ids } },
          select: { messageId: true, emoji: true, userId: true, user: { select: { username: true } } },
        });
        const map = new Map<number, any[]>();
        reactions.forEach((r: any) => {
          if (!map.has(r.messageId)) map.set(r.messageId, []);
          map.get(r.messageId)!.push({ emoji: r.emoji, userId: r.userId, username: r.user.username });
        });
        history.items = history.items.map((m: any) => ({ ...m, reactions: map.get(m.id) || [] }));
      }
    }
    return history;
  }

  @Get(':id/search')
  async searchChannel(
    @Param('id', ParseIntPipe) id: number,
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Req() req?: any,
  ) {
    await this.channelsService.assertMember(id, req.user.id);
    const term = (q || '').trim();
    if (!term) return { items: [], nextCursor: null };
    const lim = Math.max(1, Math.min(parseInt(limit || '30', 10) || 30, 100));
    const cur = cursor ? parseInt(cursor, 10) : undefined;
    return this.messagesService.searchInChannel(id, term, lim, cur);
  }

  @Post()
  @ApiBody({ type: CreateChannelDto })
  async createChannel(@Body() createChannelDto: CreateChannelDto, @Req() req: any): Promise<ChannelEntity> {
    return this.channelsService.create({ ...createChannelDto, creatorId: req.user?.id });
  }

  @Patch(':id')
  @ChannelRole('owner')
  @UseGuards(ChannelRoleGuard)
  async updateChannel(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateChannelDto,
  ): Promise<ChannelEntity> {
    return this.channelsService.update(id, updateDto);
  }

  @Delete(':id')
  @ChannelRole('owner')
  @UseGuards(ChannelRoleGuard)
  async removeChannel(@Param('id', ParseIntPipe) id: number): Promise<ChannelEntity> {
    return this.channelsService.remove(id);
  }

  @Post(':id/join')
  async join(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.channelsService.join(id, req.user.id);
  }

  @Get(':id/members')
  async members(
    @Param('id', ParseIntPipe) id: number,
    @Query('q') q: string | undefined,
    @Req() req: any,
  ) {
    await this.channelsService.assertMember(id, req.user.id);
    return this.channelsService.listMembers(id, q);
  }

  @Post(':id/read')
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @Body('messageId') messageId: number | undefined,
    @Req() req: any,
  ) {
    // Ensure membership
    await this.channelsService.assertMember(id, req.user.id);
    // If no messageId provided pick latest message id in channel
    let targetId = messageId;
    if (!targetId) {
      const last = await (this.channelsService.prismaClient as any).message.findFirst({
        where: { channelId: id },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      targetId = last?.id;
    }
    await this.readState.upsert(req.user.id, id, targetId || null);
    const unread = await this.readState.unreadCount(req.user.id, id);
    return { status: 'ok', lastReadMessageId: targetId || null, unread };
  }

  @Post(':id/leave')
  async leave(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.channelsService.leave(id, req.user.id);
    return { status: 'left' };
  }

  @Post(':id/mute')
  async mute(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const updated = await this.channelsService.setMute(id, req.user.id, true);
    return { status: 'ok', muted: updated.muted };
  }

  @Post(':id/unmute')
  async unmute(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const updated = await this.channelsService.setMute(id, req.user.id, false);
    return { status: 'ok', muted: updated.muted };
  }

  @Post(':id/notifications')
  async toggleNotifications(@Param('id', ParseIntPipe) id: number, @Body('enabled') enabled: boolean, @Req() req: any) {
    const updated = await this.channelsService.setNotifications(id, req.user.id, Boolean(enabled));
    return { status: 'ok', notificationsEnabled: updated.notificationsEnabled };
  }
}