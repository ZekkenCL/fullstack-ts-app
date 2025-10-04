import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../auth/jwt-payload.interface';

interface AuthenticatedSocket extends Socket {
  user?: { id: number; username: string };
}

export class SocketAdapter extends IoAdapter {
  private jwtService: JwtService;
  constructor(private app: INestApplication) {
    super(app);
    // Resolve JwtService from Nest container
    this.jwtService = this.app.get(JwtService);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
      ...options,
    });

  server.use((socket: AuthenticatedSocket, next: (err?: any) => void) => {
      try {
        // Token can come via query (?token=) or header 'authorization: Bearer <>'
        const { token } = socket.handshake.query as { token?: string };
        let raw = token;
        const authHeader = socket.handshake.headers['authorization'];
        if (!raw && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
          raw = authHeader.substring(7);
        }
        if (!raw) throw new UnauthorizedException('Missing token');
        const payload = this.jwtService.verify<JwtPayload>(raw);
        socket.user = { id: payload.sub, username: payload.username };
        return next();
      } catch (e) {
        return next(new UnauthorizedException('Invalid token'));
      }
    });

    return server;
  }
}