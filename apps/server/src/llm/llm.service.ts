import { Injectable, Logger } from '@nestjs/common';
import { hashEmbed } from '../common/vector';
import { sanitizeLlmOutput } from '../common/llm-parsing';
import { mockChat } from './mock.provider';
import { ModelConfigService, ResolvedLlmConfig } from './model-config.service';
import { env } from '../config/env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  task?: string;
  temperature?: number;
  maxTokens?: number;
  tenantId?: string;
}

export interface ChatResult {
  content: string;
  tokens: number;
  provider: 'openai-compatible' | 'mock';
  model: string;
}

const BASE_TIMEOUT_JITTER_RATIO = 0.2;

function isTimeoutError(err: Error): boolean {
  return err.message.includes('超时') || err.message.includes('预算');
}

function isBudgetExceeded(err: Error): boolean {
  return err.message.includes('预算');
}

/** 可重试：超时 / 限流 / 网关 / 集群过载（如 MiniMax 529） */
function isRetryableError(err: Error): boolean {
  if (isBudgetExceeded(err)) return false;
  if (isTimeoutError(err)) return true;
  const m = err.message;
  if (/\b(429|502|503|529)\b/.test(m)) return true;
  if (/overloaded|负载较高|rate.?limit|too many requests|temporar|unavailable|ECONNRESET|ETIMEDOUT|fetch failed/i.test(m)) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  // 自适应并发控制：观测到连续超时/过载自动降至串行，稳定后逐步回调
  private readonly maxConcurrency: number;
  private active = 0;
  private waiters: Array<() => void> = [];
  private consecutiveFailures = 0;
  private currentCap: number;

  constructor(private readonly configs: ModelConfigService) {
    this.maxConcurrency = Math.max(1, env.llmConcurrency);
    this.currentCap = this.maxConcurrency;
  }

  /** 解析当前租户生效的模型配置 */
  resolve(tenantId?: string): Promise<ResolvedLlmConfig> {
    return this.configs.resolve(tenantId);
  }

  /**
   * 自适应「并发」降级闸门（不是内容/供应商降级）：
   * - 连续超时/过载时将当前容量收敛到 1（串行），减轻对本端与上游的压力；
   * - 成功后恢复正常并发上限。
   * 注意：无法消除上游 529 集群过载，仅减少我们的并发冲击。
   */
  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.currentCap) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.waiters.shift();
      if (next) next();
    }
  }

  private track(result: 'ok' | 'timeout' | 'error'): void {
    if (result === 'timeout' || result === 'error') {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 2 && this.currentCap > 1) {
        this.currentCap = 1;
        this.logger.warn(
          `LLM 连续 ${this.consecutiveFailures} 次失败，并发降级为串行（上限 1）。此为并发降级，不会改用 Mock/其它模型`,
        );
      }
    } else {
      this.consecutiveFailures = 0;
      if (this.currentCap < this.maxConcurrency) {
        this.currentCap = this.maxConcurrency;
      }
    }
  }

  private mockResult(messages: ChatMessage[], opts: ChatOptions, model: string): ChatResult {
    const content = sanitizeLlmOutput(mockChat(messages, opts.task));
    return { content, tokens: Math.ceil(content.length / 3), provider: 'mock', model };
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const primary = await this.configs.resolve(opts.tenantId);
    if (primary.provider === 'mock' || !primary.apiKey) {
      return this.mockResult(messages, opts, primary.model);
    }

    const alternates = await this.configs.resolveAlternates(opts.tenantId, primary.configId);
    const chain = [primary, ...alternates];

    let lastErr: Error | null = null;
    for (let mi = 0; mi < chain.length; mi++) {
      const cfg = chain[mi];
      if (mi > 0) {
        this.logger.warn(
          `主模型失败，切换备用模型「${cfg.configName || cfg.model}」继续请求（${mi + 1}/${chain.length}）`,
        );
      }
      try {
        return await this.chatWithConfig(cfg, messages, opts);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (isBudgetExceeded(lastErr)) throw lastErr;
        // 不可重试类错误（如 401）不必再换模型空转；鉴权失败换其它配置仍可能有用，继续
        this.logger.warn(`模型「${cfg.configName || cfg.model}」调用失败：${lastErr.message.slice(0, 180)}`);
      }
    }

    if (env.llmFallbackMock) {
      this.logger.warn('全部真实模型均失败，已按 LLM_FALLBACK_MOCK=true 降级到离线 Mock（内容仅供演示）');
      this.track('error');
      return this.mockResult(messages, opts, primary.model);
    }

    this.logger.error(`LLM 调用最终失败（已试 ${chain.length} 个模型）：${lastErr?.message ?? 'unknown'}`);
    throw lastErr ?? new Error('LLM 调用失败');
  }

  /** 对单个模型配置做超时递增 + 529/429 等可重试错误的退避重试 */
  private async chatWithConfig(
    cfg: ResolvedLlmConfig,
    messages: ChatMessage[],
    opts: ChatOptions,
  ): Promise<ChatResult> {
    const budgetMs = env.llmMaxTotalMs;
    const budgetStarted = Date.now();
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= env.llmMaxRetries; attempt++) {
      const jitter = BASE_TIMEOUT_JITTER_RATIO * Math.random();
      const tierMs = env.llmTimeoutMs * Math.pow(env.llmTimeoutMul, attempt) * (1 + jitter);
      const spent = Date.now() - budgetStarted;
      const remaining = budgetMs - spent;
      if (remaining <= 10_000) {
        const msg = `LLM 调用超出总时长预算（${Math.round(budgetMs / 60000)} 分钟），已抛出异常终止该步骤（可重新启动以断点续跑）`;
        this.logger.error(msg);
        this.track('timeout');
        throw new Error(msg);
      }
      const timeoutMs = Math.max(1, Math.min(tierMs, remaining));

      try {
        const result = await this.withSlot(() => this.request(cfg, messages, opts, timeoutMs));
        this.track('ok');
        return result;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const timeout = isTimeoutError(lastErr);
        this.track(timeout ? 'timeout' : 'error');

        if (isBudgetExceeded(lastErr) || !isRetryableError(lastErr) || attempt >= env.llmMaxRetries) {
          throw lastErr;
        }

        // 过载/限流：短暂退避后再试（超时已用更长窗口，仍加小退避错峰）
        const backoffMs = Math.min(15_000, 1000 * Math.pow(2, attempt));
        this.logger.warn(
          `LLM「${cfg.configName || cfg.model}」第 ${attempt + 1} 次失败（${timeout ? `超时 ${Math.round(timeoutMs / 1000)}s` : lastErr.message.slice(0, 80)}），${Math.round(backoffMs / 1000)}s 后重试第 ${attempt + 2} 次`,
        );
        await sleep(backoffMs);
      }
    }
    throw lastErr ?? new Error('LLM 调用失败');
  }

  private async request(
    cfg: ResolvedLlmConfig,
    messages: ChatMessage[],
    opts: ChatOptions,
    timeoutMs: number,
  ): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // AbortController 必须覆盖到响应体读取完成：reasoning 模型会先返回响应头再长时间生成
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: opts.temperature ?? cfg.temperature ?? 0.3,
          ...(opts.maxTokens ?? cfg.maxTokens ? { max_tokens: opts.maxTokens ?? cfg.maxTokens } : {}),
          ...((cfg.thinkingEnabled === false || opts.task === 'write_section' || opts.task === 'rewrite_section')
            ? { enable_thinking: false }
            : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`LLM 调用失败: ${res.status} ${text.slice(0, 200)}`);
        throw new Error(`LLM 调用失败: ${res.status} ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices: {
          message: {
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
          };
        }[];
        usage?: { total_tokens?: number };
      };
      const msg = data.choices?.[0]?.message;
      const raw = msg?.content ?? '';
      return {
        content: sanitizeLlmOutput(raw),
        tokens: data.usage?.total_tokens ?? 0,
        provider: 'openai-compatible',
        model: cfg.model,
      };
    } catch (err) {
      if (controller.signal.aborted) {
        const msg = `LLM 调用超时（${Math.round(timeoutMs / 1000)}s 未返回，模型生成过慢或网络异常）`;
        this.logger.error(msg);
        throw new Error(msg);
      }
      if (err instanceof Error && err.message.startsWith('LLM 调用失败')) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`LLM 调用失败: ${msg}`);
      throw new Error(`LLM 调用失败: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(text: string): Promise<number[]> {
    return hashEmbed(text);
  }
}
