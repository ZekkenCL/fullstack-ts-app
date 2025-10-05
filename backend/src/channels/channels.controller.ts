import { Controller, Get, Post, Body, Param, Patch, Delete, ParseIntPipe, UseGuards, Req, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { MessagesService, ChannelHistoryResult } from '../messages/messages.service';
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
  constructor(private readonly channelsService: ChannelsService, private readonly messagesService: MessagesService) {}

  @Get()
  async getAllChannels(): Promise<ChannelEntity[]> {
    return this.channelsService.findAll();
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

  @Post(':id/leave')
  async leave(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.channelsService.leave(id, req.user.id);
    return { status: 'left' };
  }
}