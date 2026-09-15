import { SetMetadata } from '@nestjs/common';
import { Role } from '@bidstrat/shared';

export const ROLES_KEY = 'required_roles';

/** 限定可访问的角色；未标注则仅需登录 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
