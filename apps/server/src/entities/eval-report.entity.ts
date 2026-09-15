import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('t_eval_report')
export class EvalReport {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'varchar', name: 'card_id', length: 32, nullable: true })
  cardId: string | null;

  @Column({ type: 'simple-json' })
  metrics: Record<string, number>;

  @Column({ type: 'boolean', default: false })
  passed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
