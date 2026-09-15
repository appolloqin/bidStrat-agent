import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ProjectStage, ProjectStatus } from '@bidstrat/shared';

@Entity('t_project')
export class Project {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', name: 'tender_name', length: 256 })
  tenderName: string;

  @Column({ type: 'varchar', name: 'tender_no', length: 128, nullable: true })
  tenderNo: string | null;

  @Column({ type: 'datetime', nullable: true })
  deadline: Date | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ type: 'varchar', length: 32, default: 'CREATED' })
  stage: ProjectStage;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: ProjectStatus;

  @Column({ type: 'boolean', nullable: true })
  won: boolean | null;

  @Column({ name: 'result_note', type: 'text', nullable: true })
  resultNote: string | null;

  @Column({ type: 'varchar', name: 'export_file_uri', length: 512, nullable: true })
  exportFileUri: string | null;

  @Column({ type: 'varchar', name: 'created_by', length: 32, nullable: true })
  createdBy: string | null;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
