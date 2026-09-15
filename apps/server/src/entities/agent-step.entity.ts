import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { ToolName } from '@bidstrat/shared';

@Entity('t_agent_step')
export class AgentStep {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'run_id', length: 32 })
  runId: string;

  @Column({ type: 'varchar', name: 'step_id', length: 64 })
  stepId: string;

  @Column({ type: 'varchar', length: 32 })
  tool: ToolName;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';

  @Column({ type: 'simple-json', nullable: true })
  input: unknown;

  @Column({ type: 'simple-json', nullable: true })
  output: unknown;

  @Column({ type: 'int', default: 0 })
  tokens: number;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
