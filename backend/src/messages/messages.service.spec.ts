import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MessagesService', () => {
  let service: MessagesService;
  const prismaMock: any = {
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(() => {
    service = new MessagesService(prismaMock as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a message', async () => {
    const payload = { id: 1, content: 'hola', channelId: 2, senderId: 3 };
    prismaMock.message.create.mockResolvedValue(payload);
    const created = await service.create({ content: 'hola', channelId: 2, senderId: 3 });
    expect(created).toEqual(payload);
    expect(prismaMock.message.create).toHaveBeenCalledWith({ data: { content: 'hola', channelId: 2, senderId: 3 } });
  });

  it('should paginate findByChannel', async () => {
    prismaMock.message.findMany.mockResolvedValue([{ id: 1 }]);
    const list = await service.findByChannel(2, 2, 10); // page 2 limit 10
    expect(list).toHaveLength(1);
    expect(prismaMock.message.findMany).toHaveBeenCalledWith({ where: { channelId: 2 }, orderBy: { id: 'desc' }, skip: 10, take: 10 });
  });
});
