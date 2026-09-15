import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { GateStatus } from '@bidstrat/shared';

@Entity('t_experience_card')
export class ExperienceCard {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', name: 'project_id', length: 32, nullable: true })
  projectId: string | null;

  @Column({ type: 'text' })
  scenario: string;

  @Column({ name: 'before_text', type: 'text', nullable: true })
  before: string | null;

  @Column({ name: 'after_text', type: 'text', nullable: true })
  after: string | null;

  @Column({ name: 'rule_text', type: 'text' })
  rule: string;

  @Column({ type: 'varchar', length: 32 })
  target: 'SEMANTIC_MEMORY' | 'SKILL' | 'EPISODIC_MEMORY';

  @Column({ type: 'simple-json', nullable: true })
  evidence: Record<string, unknown> | null;

  @Column({ type: 'float', default: 0.5 })
  confidence: number;

  @Column({ type: 'varchar', name: 'gate_status', length: 16, default: 'PENDING' })
  gateStatus: GateStatus;

  @Column({ type: 'varchar', name: 'applied_target_id', length: 32, nullable: true })
  appliedTargetId: string | null;

  @Column({ type: 'varchar', name: 'decided_by', length: 32, nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'datetime', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
