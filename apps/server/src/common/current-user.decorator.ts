import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Role } from '@bidstrat/shared';

export interface AuthUser {
  sub: string;
  username: string;
  tenantId: string;
  role: Role;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
