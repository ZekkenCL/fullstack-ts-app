import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class WsAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const client = context.switchToWs().getClient<any>();
    if (!client?.user) {
      // debug log
      // eslint-disable-next-line no-console
      console.log('[WsAuthGuard] blocked socket id=', client?.id, 'user=', client?.user);
      throw new UnauthorizedException('Socket not authenticated');
    }
    // eslint-disable-next-line no-console
    console.log('[WsAuthGuard] allowed socket id=', client.id, 'user=', client.user);
    return true;
  }
}
