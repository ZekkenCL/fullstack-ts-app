import { ConflictException, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { AuthCredentialsDto } from '@/auth/dto/auth-credentials.dto';
import { JwtPayload } from '@/auth/jwt-payload.interface';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: AuthCredentialsDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('Username already exists');
    const hash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({ data: { username: dto.username, email: `${dto.username}@placeholder.local`, password: hash } });
    return this.issueTokens(user.id, user.username);
  }

  async validateUserPlain(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) return null;
    const valid = await argon2.verify(user.password, password);
    if (!valid) return null;
    return { id: user.id, username: user.username };
  }

  async login(credentials: AuthCredentialsDto) {
    const user = await this.prisma.user.findUnique({ where: { username: credentials.username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await argon2.verify(user.password, credentials.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id, user.username);
  }

  async validateUserById(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return { id: user.id, username: user.username };
  }

  private signAccessToken(userId: number, username: string) {
    const payload: JwtPayload = { sub: userId, username };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  private generateRefreshTokenPair() {
    const tokenId = crypto.randomUUID();
    const secretPart = crypto.randomBytes(48).toString('base64url');
    const raw = `${tokenId}.${secretPart}`; // formato <id>.<random>
    return { tokenId, raw };
  }

  private async enforceActiveTokenLimit(userId: number) {
    const maxActive = parseInt(process.env.REFRESH_TOKEN_MAX_ACTIVE || '5', 10);
    if (maxActive <= 0) return;
    const active = await (this.prisma as any).refreshToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: maxActive - 1, // keep newest (maxActive -1 before index)
    });
    if (active.length >= maxActive) {
      // revoke older tokens beyond limit
      const toRevoke = await (this.prisma as any).refreshToken.findMany({
        where: { userId, revokedAt: null },
        orderBy: { createdAt: 'asc' },
        skip: maxActive - 1,
      });
      if (toRevoke.length) {
        const ids = toRevoke.map((t: any) => t.id);
        await (this.prisma as any).refreshToken.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } });
      }
    }
  }

  private async persistRefreshToken(userId: number, tokenId: string, raw: string) {
    const tokenHash = await argon2.hash(raw);
    const ttlDays = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * ttlDays); // ttl configurable
    await (this.prisma as any).refreshToken.create({ data: { userId, tokenId, tokenHash, expiresAt } });
    await this.enforceActiveTokenLimit(userId);
    return raw;
  }

  private async issueTokens(userId: number, username: string) {
    const accessToken = this.signAccessToken(userId, username);
    const { tokenId, raw } = this.generateRefreshTokenPair();
    const refreshToken = await this.persistRefreshToken(userId, tokenId, raw);
    return { accessToken, refreshToken };
  }

  async rotateRefreshToken(oldToken: string) {
    if (!oldToken || !oldToken.includes('.')) throw new ForbiddenException('Invalid refresh token');
    const tokenId = oldToken.split('.')[0];
    const tokenRecord = await (this.prisma as any).refreshToken.findUnique({ where: { tokenId } });
    if (!tokenRecord || tokenRecord.revokedAt) throw new ForbiddenException('Invalid refresh token');
    if (tokenRecord.expiresAt < new Date()) throw new ForbiddenException('Expired refresh token');
    const valid = await argon2.verify(tokenRecord.tokenHash, oldToken).catch(() => false);
    if (!valid) throw new ForbiddenException('Invalid refresh token');
    await (this.prisma as any).refreshToken.update({ where: { id: tokenRecord.id }, data: { revokedAt: new Date() } });
    const user = await this.prisma.user.findUnique({ where: { id: tokenRecord.userId } });
    if (!user) throw new ForbiddenException('User not found');
    return this.issueTokens(user.id, user.username);
  }

  async revokeAll(userId: number) {
    await (this.prisma as any).refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { revoked: true };
  }

  // Limpieza opcional de tokens expirados (se puede llamar desde un cron/scheduler)
  async cleanupExpired() {
    const now = new Date();
    const res = await (this.prisma as any).refreshToken.deleteMany({ where: { expiresAt: { lt: now }, revokedAt: null } });
    return { deleted: res.count };
  }

  // Cron job diario para limpieza de tokens expirados
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async scheduledCleanup() {
    try {
      const result = await this.cleanupExpired();
      // no logger directo aquí para mantener servicio puro; podría inyectar logger si se desea
      return result;
    } catch {
      return { deleted: 0 };
    }
  }
}