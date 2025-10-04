import { ChannelsService } from './channels.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChannelsService', () => {
  let service: ChannelsService;
  const prismaMock: any = {
    channel: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(() => {
    service = new ChannelsService(prismaMock as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a channel', async () => {
    prismaMock.channel.create.mockResolvedValue({ id: 1, name: 'general' });
    const created = await service.create({ name: 'general' });
    expect(created).toEqual({ id: 1, name: 'general' });
    expect(prismaMock.channel.create).toHaveBeenCalledWith({ data: { name: 'general' } });
  });

  it('should list channels', async () => {
    prismaMock.channel.findMany.mockResolvedValue([{ id: 1, name: 'general' }]);
    const list = await service.findAll();
    expect(list).toHaveLength(1);
    expect(prismaMock.channel.findMany).toHaveBeenCalled();
  });
});
