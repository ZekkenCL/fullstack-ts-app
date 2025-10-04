import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

// In-memory mock DB structures
interface RefreshTokenRec { id: number; tokenId: string; userId: number; tokenHash: string; expiresAt: Date; createdAt: Date; revokedAt?: Date }
interface UserRec { id: number; username: string; email: string; password: string }

describe('AuthService', () => {
  let service: AuthService;
  let users: UserRec[] = [];
  let refreshTokens: RefreshTokenRec[] = [];
  let idCounter = 1;
  let tokenIdCounter = 1;

  const prismaMock: any = {
    user: {
      findUnique: jest.fn((args) => {
        if (args.where.id) return users.find(u => u.id === args.where.id) || null;
        if (args.where.username) return users.find(u => u.username === args.where.username) || null;
        return null;
      }),
      create: jest.fn(async (args) => {
        const rec: UserRec = { id: idCounter++, username: args.data.username, email: args.data.email, password: args.data.password };
        users.push(rec);
        return rec;
      }),
    },
    refreshToken: {
      create: jest.fn(async (args) => {
        const rec: RefreshTokenRec = { id: tokenIdCounter++, tokenId: args.data.tokenId, userId: args.data.userId, tokenHash: args.data.tokenHash, expiresAt: args.data.expiresAt, createdAt: new Date(Date.now() + tokenIdCounter), revokedAt: null as any };
        refreshTokens.push(rec);
        return rec;
      }),
      findUnique: jest.fn(async (args) => refreshTokens.find(r => r.tokenId === args.where.tokenId) || null),
      update: jest.fn(async (args) => {
        const rec = refreshTokens.find(r => r.id === args.where.id);
        if (rec) Object.assign(rec, args.data);
        return rec;
      }),
      updateMany: jest.fn(async (args) => {
        const list = refreshTokens.filter(r => (!args.where.userId || r.userId === args.where.userId) && (!('revokedAt' in args.where) || r.revokedAt === args.where.revokedAt) && (!args.where.id || (args.where.id.in && args.where.id.in.includes(r.id))));
        list.forEach(r => Object.assign(r, args.data));
        return { count: list.length };
      }),
      findMany: jest.fn(async (args) => {
        let list = refreshTokens.filter(r => r.userId === args.where.userId && r.revokedAt === args.where.revokedAt);
        if (args.orderBy?.createdAt) {
          list = list.sort((a,b) => args.orderBy.createdAt === 'desc' ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (typeof args.skip === 'number') list = list.slice(args.skip);
        return list;
      }),
      deleteMany: jest.fn(async (args) => {
        const before = refreshTokens.length;
        refreshTokens = refreshTokens.filter(r => !(r.expiresAt < args.where.expiresAt.lt && r.revokedAt === args.where.revokedAt));
        return { count: before - refreshTokens.length };
      }),
    },
  };

  beforeAll(() => {
    process.env.REFRESH_TOKEN_TTL_DAYS = '7';
    process.env.REFRESH_TOKEN_MAX_ACTIVE = '2'; // keep only 2 active
  });

  beforeEach(async () => {
    users = [];
    refreshTokens = [];
    idCounter = 1;
    tokenIdCounter = 1;
    jest.clearAllMocks();
    const jwt = new JwtService({ secret: 'test_secret' });
    service = new AuthService(jwt as any, prismaMock as any);
  });

  it('register emits access & refresh token', async () => {
    const res = await service.register({ username: 'alice', password: 'pw' } as any);
    expect(res.accessToken).toBeDefined();
    expect(res.refreshToken).toMatch(/\./); // tokenId.random
    expect(refreshTokens.length).toBe(1);
  });

  it('login multiple times enforces max active refresh tokens', async () => {
    await service.register({ username: 'bob', password: 'pw' } as any); // creates 1 refresh
    await service.login({ username: 'bob', password: 'pw' } as any); // 2 actives
    await service.login({ username: 'bob', password: 'pw' } as any); // should still be 2 actives
    await service.login({ username: 'bob', password: 'pw' } as any); // still 2 actives
    const active = refreshTokens.filter(r => r.revokedAt == null);
    expect(active.length).toBe(2);
  });

  it('rotate refresh token revokes old and issues new', async () => {
    const { refreshToken } = await service.register({ username: 'carol', password: 'pw' } as any);
    const before = refreshTokens.find(r => r.tokenHash && !r.revokedAt);
    const rotated = await service.rotateRefreshToken(refreshToken);
    expect(rotated.refreshToken).toBeDefined();
    const afterOld = refreshTokens.find(r => r.id === before?.id);
    expect(afterOld?.revokedAt).toBeTruthy();
  });
});
