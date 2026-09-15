import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type ResponseConclusion = 'FULLY_MET' | 'PARTIALLY_MET' | 'DEVIATION' | 'NOT_MET';

@Entity('t_response')
export class BidResponse {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'project_id', length: 32 })
  projectId: string;

  @Index()
  @Column({ type: 'varchar', name: 'requirement_id', length: 32 })
  requirementId: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  conclusion: ResponseConclusion | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'source_refs', type: 'simple-json', nullable: true })
  sourceRefs: { type: string; id: string; title?: string }[] | null;

  @Column({ type: 'boolean', default: false })
  confirmed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
