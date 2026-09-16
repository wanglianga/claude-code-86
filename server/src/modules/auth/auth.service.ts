import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, ROLE_NAMES } from '../../entities/user.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { Store } from '../../entities/store.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    private jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user || !user.active) throw new UnauthorizedException('账号不存在或已停用');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('密码错误');
    const token = await this.jwtService.signAsync({ sub: user.id, role: user.role });
    return { token, user: await this.profile(user) };
  }

  async profile(user: User) {
    let enterpriseName: string = null;
    let storeName: string = null;
    if (user.enterpriseId) {
      const e = await this.enterpriseRepo.findOne({ where: { id: user.enterpriseId } });
      enterpriseName = e?.name;
    }
    if (user.storeId) {
      const s = await this.storeRepo.findOne({ where: { id: user.storeId } });
      storeName = s?.name;
    }
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      roleName: ROLE_NAMES[user.role] || user.role,
      phone: user.phone,
      enterpriseId: user.enterpriseId,
      enterpriseName,
      storeId: user.storeId,
      storeName,
    };
  }
}
