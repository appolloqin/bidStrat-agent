import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { MemoryType, VersionStatus } from '@bidstrat/shared';

@Entity('t_memory')
export class Memory {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', name: 'mem_type', length: 16 })
  memType: MemoryType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'simple-json', nullable: true })
  tags: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  embedding: number[] | null;

  @Column({ type: 'float', default: 0.5 })
  confidence: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: VersionStatus;

  @Column({ type: 'varchar', name: 'source_card_id', length: 32, nullable: true })
  sourceCardId: string | null;

  @Column({ type: 'varchar', name: 'parent_id', length: 32, nullable: true })
  parentId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
