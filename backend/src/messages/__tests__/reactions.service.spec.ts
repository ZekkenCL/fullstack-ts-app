import { Test } from '@nestjs/testing';
import { ReactionsService } from '../reactions.service';
import { PrismaService } from '../../prisma/prisma.service';

// Minimal mock Prisma with in-memory storage
class MockPrisma {
  private data: any[] = [];
  reaction = {
    upsert: ({ where, create }: any) => {
      const idx = this.data.findIndex(r => r.userId === where.userId_messageId_emoji.userId && r.messageId === where.userId_messageId_emoji.messageId && r.emoji === where.userId_messageId_emoji.emoji);
      if (idx === -1) {
        const rec = { ...create };
        this.data.push(rec);
        return rec;
      }
      return this.data[idx];
    },
    delete: ({ where }: any) => {
      const before = this.data.length;
      this.data = this.data.filter(r => !(r.userId === where.userId_messageId_emoji.userId && r.messageId === where.userId_messageId_emoji.messageId && r.emoji === where.userId_messageId_emoji.emoji));
      if (this.data.length === before) throw new Error('not found');
      return { removed: true };
    },
    findMany: ({ where }: any) => this.data.filter(r => r.messageId === where.messageId),
  };
}

describe('ReactionsService', () => {
  let service: ReactionsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = new MockPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [ReactionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ReactionsService);
  });

  it('adds a reaction once (idempotent upsert)', async () => {
    await service.addReaction(1, 10, '👍');
    await service.addReaction(1, 10, '👍');
    const list = await service.listForMessage(10);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ userId: 1, messageId: 10, emoji: '👍' });
  });

  it('adds multiple different reactions', async () => {
    await service.addReaction(1, 10, '👍');
    await service.addReaction(2, 10, '👍');
    await service.addReaction(1, 10, '🔥');
    const list = await service.listForMessage(10);
  expect(list.map((r: any) => r.emoji).sort()).toEqual(['🔥','👍','👍']);
  });

  it('removes reaction and is idempotent', async () => {
    await service.addReaction(1, 10, '👍');
    await service.removeReaction(1, 10, '👍');
    // second remove should not throw
    await service.removeReaction(1, 10, '👍');
    const list = await service.listForMessage(10);
    expect(list).toHaveLength(0);
  });
});
