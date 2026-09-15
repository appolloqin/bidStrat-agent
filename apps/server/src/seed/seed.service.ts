import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { LlmConfig, Memory, Skill, Tenant, User } from '../entities';
import { nextId } from '../common/snowflake';
import { hashEmbed } from '../common/vector';
import { encryptSecret } from '../common/crypto';
import { env } from '../config/env';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Seed');

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    const userRepo = this.dataSource.getRepository(User);
    if ((await userRepo.count()) > 0) return;
    this.logger.log('初始化默认租户与示例数据...');
    const tenant = this.dataSource.getRepository(Tenant).create({
      id: nextId(),
      name: '示范企业',
      code: 'demo',
    });
    await this.dataSource.getRepository(Tenant).save(tenant);
    const adminPwd = await bcrypt.hash('admin123', 10);
    const userPwd = await bcrypt.hash('user123', 10);
    await userRepo.save([
      userRepo.create({
        id: nextId(),
        tenantId: tenant.id,
        username: 'admin',
        passwordHash: adminPwd,
        displayName: '系统管理员',
        role: 'ADMIN',
        status: 'ACTIVE',
      }),
      userRepo.create({
        id: nextId(),
        tenantId: tenant.id,
        username: 'user',
        passwordHash: userPwd,
        displayName: '投标专员',
        role: 'SPECIALIST',
        status: 'ACTIVE',
      }),
    ]);
    const memRepo = this.dataSource.getRepository(Memory);
    await memRepo.save([
      memRepo.create({
        id: nextId(),
        tenantId: tenant.id,
        memType: 'SEMANTIC',
        content: '我司在政务标中常用"四统一"方法论：统一架构、统一数据、统一安全、统一运维。',
        tags: ['政务', '方法论'],
        confidence: 0.8,
        status: 'ACTIVE',
        version: 1,
        embedding: hashEmbed('我司在政务标中常用四统一方法论'),
      }),
      memRepo.create({
        id: nextId(),
        tenantId: tenant.id,
        memType: 'SEMANTIC',
        content: '报价表必须包含分项单价、合规说明、税费拆分；不允许出现"详见附件"字样。',
        tags: ['商务', '报价'],
        confidence: 0.9,
        status: 'ACTIVE',
        version: 1,
        embedding: hashEmbed('报价表分项单价'),
      }),
    ]);
    const skillRepo = this.dataSource.getRepository(Skill);
    await skillRepo.save(
      skillRepo.create({
        id: nextId(),
        tenantId: tenant.id,
        name: '技术方案结构化写作',
        trigger: '写技术方案章节',
        promptTpl:
          '你是一名资深解决方案架构师，按【概述→现状分析→总体设计→详细设计→实施计划→风险与保障】六段式撰写。引用检索要点编号 ${refs}，不少于 1500 字。',
        tools: ['search_knowledge', 'self_review'],
        version: 1,
        status: 'ACTIVE',
        approvedBy: null,
        approvedAt: new Date(),
      }),
    );
    const llmRepo = this.dataSource.getRepository(LlmConfig);
    if ((await llmRepo.count({ where: { tenantId: tenant.id } })) === 0) {
      await llmRepo.save(
        llmRepo.create({
          id: nextId(),
          tenantId: tenant.id,
          name: '默认模型',
          provider: env.llmApiKey ? 'openai-compatible' : 'mock',
          baseUrl: env.llmBaseUrl,
          model: env.llmModel,
          temperature: 0.3,
          maxTokens: null,
          apiKeyCipher: env.llmApiKey ? encryptSecret(env.llmApiKey) : null,
          enabled: true,
          isDefault: true,
        }),
      );
    }
    this.logger.log('种子数据初始化完成：默认租户 demo / 管理员 admin/admin123 / 专员 user/user123');
  }
}