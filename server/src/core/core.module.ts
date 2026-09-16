import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';

/**
 * 全局提供 User 仓库：JwtAuthGuard 在各业务模块的控制器上实例化，
 * 需要能注入 Repository<User>，而不必每个模块重复 forFeature。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  exports: [TypeOrmModule],
})
export class CoreModule {}
