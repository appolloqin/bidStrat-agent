import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ToolName, VersionStatus } from '@bidstrat/shared';

@Entity('t_skill')
export class Skill {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ name: 'trigger_kw', type: 'text', nullable: true })
  trigger: string | null;

  @Column({ name: 'prompt_tpl', type: 'text' })
  promptTpl: string;

  @Column({ type: 'simple-json', nullable: true })
  tools: ToolName[] | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: VersionStatus;

  @Column({ type: 'varchar', name: 'parent_id', length: 32, nullable: true })
  parentId: string | null;

  @Column({ type: 'varchar', name: 'source_card_id', length: 32, nullable: true })
  sourceCardId: string | null;

  @Column({ type: 'varchar', name: 'approved_by', length: 32, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
