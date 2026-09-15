import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findByUsername(dto.username);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload = { sub: user.id, username: user.username, tenantId: user.tenantId, role: user.role };
    const token = await this.jwt.signAsync(payload);
    await this.audit.log(user.tenantId, { sub: user.id, username: user.username }, 'auth.login', 'user', user.id);
    return { accessToken: token, token, user: this.users.sanitize(user) };
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('用户不存在');
    return this.users.sanitize(user);
  }
}
