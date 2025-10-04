import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHANNEL_ROLE_KEY } from './channel-role.decorator';
import { ChannelsService } from './channels.service';

@Injectable()
export class ChannelRoleGuard implements CanActivate {
  constructor(private reflector: Reflector, private channelsService: ChannelsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.get<string | undefined>(CHANNEL_ROLE_KEY, context.getHandler());
    if (!requiredRole) return true; // no role required
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('No user');
    // channelId might come from route param :id
    const channelId = parseInt(req.params?.id, 10);
    if (!channelId) throw new ForbiddenException('Channel id missing');
    const membership = await this.channelsService.findMembership(channelId, user.id);
    if (!membership) throw new ForbiddenException('Not a channel member');
    if (membership.role !== requiredRole) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
