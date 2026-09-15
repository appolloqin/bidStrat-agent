import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { FeedbackAction } from '@bidstrat/shared';

@Entity('t_edit_feedback')
export class EditFeedback {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'project_id', length: 32 })
  projectId: string;

  @Index()
  @Column({ type: 'varchar', name: 'section_id', length: 32 })
  sectionId: string;

  @Column({ name: 'before_content', type: 'text', nullable: true })
  beforeContent: string | null;

  @Column({ name: 'after_content', type: 'text', nullable: true })
  afterContent: string | null;

  @Column({ type: 'varchar', length: 16 })
  action: FeedbackAction;

  @Column({ type: 'varchar', length: 16, nullable: true })
  rating: 'GOOD' | 'OK' | 'REWRITE' | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'varchar', name: 'created_by', length: 32, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
