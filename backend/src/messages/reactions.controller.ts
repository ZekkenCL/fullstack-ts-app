import { Controller, Post, Delete, Param, Body, ParseIntPipe, UseGuards, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReactionsService } from './reactions.service';

@ApiTags('reactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messages/:id/reactions')
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Post()
  async add(@Param('id', ParseIntPipe) id: number, @Body('emoji') emoji: string, @Req() req: any) {
    await this.reactions.addReaction(req.user.id, id, emoji);
    return { status: 'ok' };
  }

  @Delete()
  async remove(@Param('id', ParseIntPipe) id: number, @Body('emoji') emoji: string, @Req() req: any) {
    await this.reactions.removeReaction(req.user.id, id, emoji);
    return { status: 'ok' };
  }

  @Get()
  async list(@Param('id', ParseIntPipe) id: number) {
    return this.reactions.listForMessage(id);
  }
}
