import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export interface OutlineNode {
  no: string;
  title: string;
  path: string;
}

@Entity('t_tender_doc')
export class TenderDoc {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'project_id', length: 32 })
  projectId: string;

  @Column({ type: 'varchar', name: 'file_name', length: 256 })
  fileName: string;

  @Column({ type: 'varchar', name: 'file_uri', length: 512 })
  fileUri: string;

  @Column({ type: 'varchar', name: 'mime_type', length: 128, nullable: true })
  mimeType: string | null;

  @Column({ type: 'varchar', name: 'parse_status', length: 16, default: 'PENDING' })
  parseStatus: 'PENDING' | 'PARSING' | 'PARSED' | 'FAILED';

  @Column({ type: 'simple-json', nullable: true })
  outline: OutlineNode[] | null;

  @Column({ type: 'varchar', name: 'uploaded_by', length: 32, nullable: true })
  uploadedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
