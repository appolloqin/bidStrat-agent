import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('t_clause')
export class Clause {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'doc_id', length: 32 })
  docId: string;

  @Column({ type: 'varchar', name: 'section_path', length: 512, default: '' })
  sectionPath: string;

  @Column({ type: 'varchar', name: 'clause_no', length: 64, nullable: true })
  clauseNo: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 32, default: 'CLAUSE' })
  type: string;

  @CreateDateColumn()
  createdAt: Date;
}
