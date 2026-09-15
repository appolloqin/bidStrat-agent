import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '@bidstrat/shared';

@Entity('t_user')
export class User {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  username: string;

  @Column({ type: 'varchar', name: 'password_hash', length: 128 })
  passwordHash: string;

  @Column({ type: 'varchar', name: 'display_name', length: 64, default: '' })
  displayName: string;

  @Column({ type: 'varchar', length: 16, default: 'SPECIALIST' })
  role: Role;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
