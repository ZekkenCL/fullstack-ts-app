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
  async getAllChannels(@Req() req: any): Promise<(ChannelEntity & { unread?: number })[]> {
    const channels = await this.channelsService.findAll();
    const userId = req.user?.id;
    if (!userId) return channels;
    // For each channel membership compute unread (naive N+1; could batch optimize later)
    const enriched: (ChannelEntity & { unread?: number })[] = [];
    for (const c of channels) {
      try {
        await this.channelsService.assertMember(c.id, userId);
        const unread = await this.readState.unreadCount(userId, c.id);
        enriched.push({ ...c, unread });
      } catch {
        enriched.push(c as any);
      }
    }
    return enriched;
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
    return this.messagesService.channelHistory(id, lim, cur);
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
}