import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities';
import { nextId } from '../common/snowflake';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(
    tenantId: string,
    operator: { sub?: string; username?: string } | null,
    action: string,
    targetType?: string,
    targetId?: string,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.save({
      id: nextId(),
      tenantId,
      operatorId: operator?.sub ?? null,
      operatorName: operator?.username ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      detail: detail ?? null,
    });
  }

  async list(tenantId: string, query: { action?: string; targetType?: string }): Promise<AuditLog[]> {
    const qb = this.repo.createQueryBuilder('a').where('a.tenant_id = :tenantId', { tenantId });
    if (query.action) qb.andWhere('a.action = :action', { action: query.action });
    if (query.targetType) qb.andWhere('a.target_type = :targetType', { targetType: query.targetType });
    return qb.orderBy('a.createdAt', 'DESC').limit(200).getMany();
  }
}
