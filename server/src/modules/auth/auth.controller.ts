import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { User } from '../../entities/user.entity';

class LoginDto {
  @IsNotEmpty({ message: '请输入用户名' })
  username: string;

  @IsNotEmpty({ message: '请输入密码' })
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return this.authService.profile(user);
  }
}
