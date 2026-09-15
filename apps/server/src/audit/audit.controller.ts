import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.audit.list(user.tenantId, { action, targetType });
  }
}
