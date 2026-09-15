import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('t_audit_log')
export class AuditLog {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', name: 'operator_id', length: 32, nullable: true })
  operatorId: string | null;

  @Column({ type: 'varchar', name: 'operator_name', length: 64, nullable: true })
  operatorName: string | null;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', name: 'target_type', length: 64, nullable: true })
  targetType: string | null;

  @Column({ type: 'varchar', name: 'target_id', length: 32, nullable: true })
  targetId: string | null;

  @Column({ type: 'simple-json', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
