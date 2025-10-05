import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBody, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from '@/auth/auth.service';
import { AuthCredentialsDto } from '@/auth/dto/auth-credentials.dto';
import { RefreshTokenDto } from '@/auth/dto/refresh-token.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { LoginRateLimitGuard } from '@/auth/guards/login-rate-limit.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiBody({ type: AuthCredentialsDto })
  @ApiOkResponse({ description: 'Registro correcto. Devuelve accessToken.' })
  async register(@Body() dto: AuthCredentialsDto) {
    return this.authService.register(dto);
  }

  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  @ApiBody({ type: AuthCredentialsDto })
  @ApiOkResponse({ description: 'Login correcto. Devuelve accessToken.' })
  async login(@Body() dto: AuthCredentialsDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('profile')
  getProfile(@Req() req: any) {
    return { user: req.user };
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.rotateRefreshToken(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  async logout(@Req() req: any) {
    return this.authService.revokeAll(req.user.id);
  }
}