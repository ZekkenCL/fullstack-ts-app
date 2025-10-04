import { Controller, Get, Post, Body, Param, Patch, Delete, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Prisma } from '@prisma/client';

type ChannelEntity = Prisma.ChannelGetPayload<{}>;

@ApiTags('channels')
@ApiBearerAuth()
@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  async getAllChannels(): Promise<ChannelEntity[]> {
    return this.channelsService.findAll();
  }

  @Get(':id')
  async getChannelById(@Param('id', ParseIntPipe) id: number): Promise<ChannelEntity | null> {
    return this.channelsService.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateChannelDto })
  async createChannel(@Body() createChannelDto: CreateChannelDto, @Req() req: any): Promise<ChannelEntity> {
    return this.channelsService.create({ ...createChannelDto, creatorId: req.user?.id });
  }

  @Patch(':id')
  async updateChannel(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateChannelDto,
  ): Promise<ChannelEntity> {
    return this.channelsService.update(id, updateDto);
  }

  @Delete(':id')
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