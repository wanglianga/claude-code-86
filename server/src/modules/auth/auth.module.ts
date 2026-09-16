import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../../entities/user.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { Store } from '../../entities/store.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Enterprise, Store]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'freshmeal-dev-secret',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
