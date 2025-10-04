import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, Delete, UseGuards, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { ChannelsService } from '../channels/channels.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Prisma } from '@prisma/client';
import { Paginated } from './messages.service';

type MessageEntity = Prisma.MessageGetPayload<{}>;

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService, private readonly channelsService: ChannelsService) {}

  @Post()
  @ApiBody({ type: CreateMessageDto })
  async create(@Body() dto: CreateMessageDto, @Req() req: any): Promise<MessageEntity> {
    const user = req.user;
    if (!user?.id) throw new UnauthorizedException();
    await this.channelsService.assertMember(dto.channelId, user.id);
    return this.messagesService.create({ content: dto.content, channelId: dto.channelId, senderId: user.id });
  }

  @Get()
  async findAll(@Req() req: any, @Query() query: QueryMessagesDto): Promise<Paginated<MessageEntity>> {
    const user = req.user;
    if (!user?.id) throw new UnauthorizedException();
    const { channelId, page = 1, limit = 50 } = query;
    if (channelId) {
      await this.channelsService.assertMember(channelId, user.id);
      const [items, total] = await Promise.all([
        this.messagesService.findByChannel(channelId, page, limit),
        this.messagesService.countByChannel(channelId),
      ]);
      return { page, limit, total, items };
    }
    const [items, total] = await Promise.all([
      this.messagesService.findAll(page, limit),
      this.messagesService.countByChannel(-1).catch(() => 0), // meaningless total when no channel filter
    ]);
    return { page, limit, total, items };
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<MessageEntity> {
    return this.messagesService.remove(id);
  }
}