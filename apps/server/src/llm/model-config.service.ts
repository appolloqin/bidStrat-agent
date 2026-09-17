import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmConfig, LlmProvider } from '../entities';
import { nextId } from '../common/snowflake';
import { decryptSecret, encryptSecret, maskSecret } from '../common/crypto';
import { env } from '../config/env';

export interface ResolvedLlmConfig {
  source: 'db' | 'env' | 'mock';
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  thinkingEnabled: boolean;
  configId?: string;
  configName?: string;
}

export interface UpsertLlmConfigInput {
  name?: string;
  provider?: LlmProvider;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number | null;
  enabled?: boolean;
  thinkingEnabled?: boolean;
  isDefault?: boolean;
}

export interface PublicLlmConfig {
  id: string | null;
  source: 'db' | 'env' | 'mock';
  name: string;
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  enabled: boolean;
  thinkingEnabled: boolean;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  updatedAt: Date | null;
}

export interface LlmConfigListResult {
  items: PublicLlmConfig[];
  /** 当前生效配置（默认启用项，或 env/mock 回退） */
  active: PublicLlmConfig;
}

@Injectable()
export class ModelConfigService {
  private readonly logger = new Logger('ModelConfig');
  private readonly cache = new Map<string, { cfg: ResolvedLlmConfig; at: number }>();
  private readonly ttlMs = 15000;

  constructor(
    @InjectRepository(LlmConfig)
    private readonly repo: Repository<LlmConfig>,
  ) {}

  /** 解析租户生效的模型配置（优先默认启用项；带 15s 缓存） */
  async resolve(tenantId?: string, bypassCache = false): Promise<ResolvedLlmConfig> {
    const key = tenantId ?? '__global__';
    const hit = this.cache.get(key);
    if (!bypassCache && hit && Date.now() - hit.at < this.ttlMs) return hit.cfg;
    const cfg = await this.load(tenantId);
    this.cache.set(key, { cfg, at: Date.now() });
    return cfg;
  }

  /**
   * 主模型之外的可用备用配置（已启用、有 Key、非 mock），按默认优先、更新时间倒序。
   * 供 LLM 服务在 529/超时等失败后切换。
   */
  async resolveAlternates(tenantId?: string, excludeConfigId?: string): Promise<ResolvedLlmConfig[]> {
    if (!tenantId) return [];
    const rows = await this.repo.find({
      where: { tenantId, enabled: true },
      order: { isDefault: 'DESC', updatedAt: 'DESC' },
    });
    const out: ResolvedLlmConfig[] = [];
    for (const row of rows) {
      if (excludeConfigId && row.id === excludeConfigId) continue;
      if (row.provider === 'mock') continue;
      const resolved = this.rowToResolved(row);
      if (resolved?.apiKey) out.push(resolved);
    }
    return out;
  }

  private async load(tenantId?: string): Promise<ResolvedLlmConfig> {
    if (tenantId) {
      const row =
        (await this.repo.findOne({
          where: { tenantId, enabled: true, isDefault: true },
        })) ??
        (await this.repo.findOne({
          where: { tenantId, enabled: true },
          order: { isDefault: 'DESC', updatedAt: 'DESC' },
        }));
      if (row) {
        const resolved = this.rowToResolved(row);
        if (resolved) return resolved;
        this.logger.warn(`租户 ${tenantId} 的默认模型配置缺少 API Key，回退环境变量`);
      }
    }
    return this.envOrMock();
  }

  private rowToResolved(row: LlmConfig): ResolvedLlmConfig | null {
    const apiKey = decryptSecret(row.apiKeyCipher);
    if (row.provider === 'mock') {
      return {
        source: 'db',
        provider: 'mock',
        baseUrl: row.baseUrl || env.llmBaseUrl,
        apiKey: '',
        model: row.model || env.llmModel,
        temperature: row.temperature,
        maxTokens: row.maxTokens,
        thinkingEnabled: row.thinkingEnabled,
        configId: row.id,
        configName: row.name,
      };
    }
    if (!apiKey) return null;
    return {
      source: 'db',
      provider: 'openai-compatible',
      baseUrl: row.baseUrl || env.llmBaseUrl,
      apiKey,
      model: row.model || env.llmModel,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      thinkingEnabled: row.thinkingEnabled,
      configId: row.id,
      configName: row.name,
    };
  }

  private envOrMock(): ResolvedLlmConfig {
    if (env.llmApiKey) {
      return {
        source: 'env',
        provider: 'openai-compatible',
        baseUrl: env.llmBaseUrl,
        apiKey: env.llmApiKey,
        model: env.llmModel,
        temperature: 0.3,
        maxTokens: null,
        thinkingEnabled: true,
      };
    }
    return {
      source: 'mock',
      provider: 'mock',
      baseUrl: env.llmBaseUrl,
      apiKey: '',
      model: env.llmModel,
      temperature: 0.3,
      maxTokens: null,
      thinkingEnabled: true,
    };
  }

  private toPublic(row: LlmConfig): PublicLlmConfig {
    const apiKey = decryptSecret(row.apiKeyCipher);
    return {
      id: row.id,
      source: 'db',
      name: row.name,
      provider: row.provider,
      baseUrl: row.baseUrl,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      enabled: row.enabled,
      thinkingEnabled: row.thinkingEnabled,
      isDefault: row.isDefault,
      hasApiKey: !!apiKey,
      apiKeyMasked: maskSecret(apiKey),
      updatedAt: row.updatedAt,
    };
  }

  private fallbackPublic(): PublicLlmConfig {
    const hasEnvKey = !!env.llmApiKey;
    return {
      id: null,
      source: hasEnvKey ? 'env' : 'mock',
      name: hasEnvKey ? '环境变量' : '离线 Mock',
      provider: hasEnvKey ? 'openai-compatible' : 'mock',
      baseUrl: env.llmBaseUrl,
      model: env.llmModel,
      temperature: 0.3,
      maxTokens: null,
      enabled: true,
      thinkingEnabled: true,
      isDefault: true,
      hasApiKey: hasEnvKey,
      apiKeyMasked: maskSecret(env.llmApiKey),
      updatedAt: null,
    };
  }

  async listPublic(tenantId: string): Promise<LlmConfigListResult> {
    const rows = await this.repo.find({
      where: { tenantId },
      order: { isDefault: 'DESC', updatedAt: 'DESC' },
    });
    const items = rows.map((r) => this.toPublic(r));
    const activeRow =
      rows.find((r) => r.enabled && r.isDefault) ??
      rows.find((r) => r.enabled) ??
      null;
    const active = activeRow ? this.toPublic(activeRow) : this.fallbackPublic();
    if (activeRow && activeRow.provider !== 'mock' && !decryptSecret(activeRow.apiKeyCipher)) {
      return { items, active: this.fallbackPublic() };
    }
    return { items, active };
  }

  async getPublicById(tenantId: string, id: string): Promise<PublicLlmConfig> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('模型配置不存在');
    return this.toPublic(row);
  }

  async create(tenantId: string, input: UpsertLlmConfigInput, updatedBy: string): Promise<PublicLlmConfig> {
    const count = await this.repo.count({ where: { tenantId } });
    const makeDefault = input.isDefault === true || count === 0;
    if (makeDefault) await this.clearDefault(tenantId);

    const row = this.repo.create({
      id: nextId(),
      tenantId,
      name: input.name?.trim() || `模型配置 ${count + 1}`,
      provider: input.provider ?? (input.apiKey ? 'openai-compatible' : 'mock'),
      baseUrl: input.baseUrl ?? env.llmBaseUrl,
      model: input.model ?? env.llmModel,
      temperature: input.temperature ?? 0.3,
      maxTokens: input.maxTokens ?? null,
      enabled: input.enabled ?? true,
      thinkingEnabled: input.thinkingEnabled ?? true,
      isDefault: makeDefault,
      apiKeyCipher: input.apiKey ? encryptSecret(input.apiKey) : null,
      updatedBy,
    });
    await this.repo.save(row);
    this.cache.delete(tenantId);
    return this.toPublic(row);
  }

  async update(
    tenantId: string,
    id: string,
    input: UpsertLlmConfigInput,
    updatedBy: string,
  ): Promise<PublicLlmConfig> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('模型配置不存在');
    if (input.name !== undefined) row.name = input.name;
    if (input.provider !== undefined) row.provider = input.provider;
    if (input.baseUrl !== undefined) row.baseUrl = input.baseUrl;
    if (input.model !== undefined) row.model = input.model;
    if (input.temperature !== undefined) row.temperature = input.temperature;
    if (input.maxTokens !== undefined) row.maxTokens = input.maxTokens;
    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.thinkingEnabled !== undefined) row.thinkingEnabled = input.thinkingEnabled;
    if (input.apiKey !== undefined) {
      row.apiKeyCipher = input.apiKey === '' ? null : encryptSecret(input.apiKey);
    }
    row.updatedBy = updatedBy;
    await this.repo.save(row);
    this.cache.delete(tenantId);
    return this.toPublic(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('模型配置不存在');
    const wasDefault = row.isDefault;
    await this.repo.remove(row);
    if (wasDefault) {
      const next = await this.repo.findOne({
        where: { tenantId },
        order: { enabled: 'DESC', updatedAt: 'DESC' },
      });
      if (next) {
        next.isDefault = true;
        await this.repo.save(next);
      }
    }
    this.cache.delete(tenantId);
  }

  async setDefault(tenantId: string, id: string, updatedBy: string): Promise<PublicLlmConfig> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('模型配置不存在');
    if (!row.enabled) {
      throw new BadRequestException('停用的配置不能设为默认，请先启用');
    }
    await this.clearDefault(tenantId);
    row.isDefault = true;
    row.updatedBy = updatedBy;
    await this.repo.save(row);
    this.cache.delete(tenantId);
    return this.toPublic(row);
  }

  private async clearDefault(tenantId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(LlmConfig)
      .set({ isDefault: false })
      .where('tenant_id = :tenantId AND is_default = :flag', { tenantId, flag: true })
      .execute();
  }

  /** 连通性测试；可基于已保存配置 id，或临时覆盖字段（不落库） */
  async test(
    tenantId: string,
    overrides?: { id?: string; baseUrl?: string; apiKey?: string; model?: string },
  ): Promise<{ ok: boolean; provider: LlmProvider; model: string; latencyMs: number; message: string }> {
    let base = await this.resolve(tenantId, true);
    if (overrides?.id) {
      const row = await this.repo.findOne({ where: { id: overrides.id, tenantId } });
      if (!row) throw new NotFoundException('模型配置不存在');
      const fromRow = this.rowToResolved(row);
      if (fromRow) {
        base = fromRow;
      } else if (row.provider === 'mock') {
        base = {
          source: 'db',
          provider: 'mock',
          baseUrl: row.baseUrl || env.llmBaseUrl,
          apiKey: '',
          model: row.model || env.llmModel,
          temperature: row.temperature,
          maxTokens: row.maxTokens,
          thinkingEnabled: row.thinkingEnabled,
          configId: row.id,
          configName: row.name,
        };
      } else {
        base = {
          ...base,
          source: 'db',
          provider: 'openai-compatible',
          baseUrl: row.baseUrl || env.llmBaseUrl,
          apiKey: '',
          model: row.model || env.llmModel,
          temperature: row.temperature,
          maxTokens: row.maxTokens,
          thinkingEnabled: row.thinkingEnabled,
          configId: row.id,
          configName: row.name,
        };
      }
    }
    const cfg: ResolvedLlmConfig = {
      ...base,
      baseUrl: overrides?.baseUrl ?? base.baseUrl,
      apiKey: overrides?.apiKey ?? base.apiKey,
      model: overrides?.model ?? base.model,
      provider: overrides?.apiKey || base.apiKey ? 'openai-compatible' : base.provider === 'mock' ? 'mock' : 'openai-compatible',
    };
    if (overrides?.apiKey) cfg.provider = 'openai-compatible';
    if (cfg.provider === 'mock' || !cfg.apiKey) {
      return {
        ok: true,
        provider: 'mock',
        model: cfg.model,
        latencyMs: 0,
        message: '当前为离线 Mock 模式（未配置 API Key），无需联网即可运行',
      };
    }
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const keyMasked = maskSecret(cfg.apiKey);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
        }),
      });
      const elapsed = Date.now() - started;
      if (!res.ok) {
        const text = await res.text();
        return {
          ok: false,
          provider: 'openai-compatible',
          model: cfg.model,
          latencyMs: elapsed,
          message: `HTTP ${res.status}: ${text.slice(0, 200)}（请求地址 ${url}，Key ${keyMasked}）`,
        };
      }
      await res.json();
      return {
        ok: true,
        provider: 'openai-compatible',
        model: cfg.model,
        latencyMs: elapsed,
        message: `连接成功（${url}，Key ${keyMasked}）`,
      };
    } catch (err) {
      const elapsed = Date.now() - started;
      return {
        ok: false,
        provider: 'openai-compatible',
        model: cfg.model,
        latencyMs: elapsed,
        message: `${err instanceof Error ? err.message : String(err)}（请求地址 ${url}）`,
      };
    }
  }
}
