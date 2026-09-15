import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('t_eval_case')
export class EvalCase {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'simple-json' })
  input: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  expected: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
