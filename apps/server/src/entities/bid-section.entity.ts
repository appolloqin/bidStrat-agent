import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('t_bid_section')
export class BidSection {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'project_id', length: 32 })
  projectId: string;

  @Column({ type: 'varchar', name: 'outline_no', length: 32 })
  outlineNo: string;

  @Column({ type: 'varchar', length: 256 })
  title: string;

  /** 招标文件中的对应位置（条款 sectionPath），导出时用于在原文该处插入应答 */
  @Column({ type: 'varchar', name: 'tender_anchor', length: 512, nullable: true })
  tenderAnchor: string | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'gen_version', type: 'int', default: 0 })
  genVersion: number;

  @Column({ name: 'final_version', type: 'int', default: 0 })
  finalVersion: number;

  @Column({ name: 'review_score', type: 'float', nullable: true })
  reviewScore: number | null;

  @Column({ type: 'varchar', length: 16, default: 'GENERATED' })
  status: 'GENERATED' | 'FINALIZED';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
