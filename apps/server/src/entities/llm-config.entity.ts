import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type LlmProvider = 'openai-compatible' | 'mock';

/** 租户级大模型配置；apiKeyCipher 为 AES-256-GCM 密文 */
@Entity('t_llm_config')
export class LlmConfig {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Index()
  @Column({ name: 'tenant_id', length: 32 })
  tenantId: string;

  @Column({ type: 'varchar', length: 128, default: '默认模型' })
  name: string;

  @Column({ type: 'varchar', length: 32, default: 'mock' })
  provider: LlmProvider;

  @Column({ name: 'base_url', type: 'varchar', length: 512, default: '' })
  baseUrl: string;

  @Column({ name: 'api_key_cipher', type: 'text', nullable: true })
  apiKeyCipher: string | null;

  @Column({ type: 'varchar', length: 128, default: 'gpt-4o-mini' })
  model: string;

  @Column({ type: 'float', default: 0.3 })
  temperature: number;

  @Column({ name: 'max_tokens', type: 'int', nullable: true })
  maxTokens: number | null;

  /** 是否开启思考模式（reasoning）；关闭后请求携带 enable_thinking=false */
  @Column({ name: 'thinking_enabled', type: 'boolean', default: true })
  thinkingEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: true })
  isDefault: boolean;

  @Column({ name: 'updated_by', type: 'varchar', length: 32, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
