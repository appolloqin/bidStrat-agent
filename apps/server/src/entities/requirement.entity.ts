import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { RequirementCategory } from '@bidstrat/shared';

@Entity('t_requirement')
export class Requirement {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'project_id', length: 32 })
  projectId: string;

  @Column({ type: 'varchar', name: 'clause_id', length: 32, nullable: true })
  clauseId: string | null;

  @Column({ type: 'varchar', length: 32 })
  category: RequirementCategory;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'boolean', default: false })
  mandatory: boolean;

  @Column({ type: 'boolean', default: false })
  confirmed: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
