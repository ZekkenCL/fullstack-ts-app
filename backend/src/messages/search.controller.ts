import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { ChannelsService } from '../channels/channels.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class GlobalSearchController {
  constructor(private readonly messages: MessagesService, private readonly channels: ChannelsService) {}

  // Global multi-channel search only across channels where user is a member
  @Get('messages')
  async searchAll(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Req() req?: any,
  ) {
    const userId = req.user?.id;
    const term = (q || '').trim();
    if (!term) return { items: [], nextCursor: null };
    const lim = Math.max(1, Math.min(parseInt(limit || '40', 10) || 40, 100));
    const cur = cursor ? parseInt(cursor, 10) : undefined;
    return this.messages.globalSearch(userId, term, lim, cur);
  }
}