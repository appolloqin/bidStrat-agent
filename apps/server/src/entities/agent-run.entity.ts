import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { AgentPlanStep, AgentRunStatus } from '@bidstrat/shared';

@Entity('t_agent_run')
export class AgentRun {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'project_id', length: 32 })
  projectId: string;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: AgentRunStatus;

  @Column({ type: 'simple-json' })
  plan: AgentPlanStep[];

  @Column({ type: 'varchar', name: 'current_step_id', length: 32, nullable: true })
  currentStepId: string | null;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'last_activity_at', type: 'datetime', nullable: true })
  lastActivityAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
