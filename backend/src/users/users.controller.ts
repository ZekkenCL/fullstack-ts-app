import { Controller, Get, Post, Body, Param, UseInterceptors, UploadedFile, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { v4 as uuid } from 'uuid';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<User | null> {
    return this.usersService.findOne(Number(id));
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dest = join(__dirname, '..', '..', 'uploads', 'avatars');
        try { mkdirSync(dest, { recursive: true }); } catch {}
        cb(null, dest);
      },
      filename: (_req, file, cb) => {
        const unique = uuid();
        cb(null, unique + extname(file.originalname));
      }
    }),
    limits: { fileSize: 1024 * 1024 * 2 }, // 2MB
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new BadRequestException('Invalid file type') as any, false);
      cb(null, true);
    }
  }))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Req() req: any): Promise<{ avatarUrl: string }> {
    if (!file) throw new BadRequestException('File required');
    const user = req.user;
    const relative = `/uploads/avatars/${file.filename}`;
    await this.usersService.updateAvatar(user.id, relative);
    return { avatarUrl: relative };
  }
}