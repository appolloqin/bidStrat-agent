import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('t_kb_chunk')
export class KBChunk {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', name: 'asset_id', length: 32 })
  assetId: string;

  @Column({ name: 'chunk_no', type: 'int', default: 0 })
  chunkNo: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'simple-json', nullable: true })
  embedding: number[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
