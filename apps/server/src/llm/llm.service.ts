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

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  // 自适应并发控制：观测到连续超时自动降至串行，稳定后逐步回调
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
   * 自适应降级后的并发闸门：
   * - 并发超时/拥塞时，连续失败达到阈值，将当前容量收敛到 1（串行），缓解超时；
   * - 成功后逐步恢复正常并发上限。
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
      // 连续失败 → 降并发到串行（上限 1）
      if (this.consecutiveFailures >= 2 && this.currentCap > 1) {
        this.currentCap = 1;
        this.logger.warn(`LLM 连续 ${this.consecutiveFailures} 次失败，并发降级为串行（上限 1）以缓解超时`);
      }
    } else {
      this.consecutiveFailures = 0;
      if (this.currentCap < this.maxConcurrency) {
        this.currentCap = this.maxConcurrency;
      }
    }
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const cfg = await this.configs.resolve(opts.tenantId);
    if (cfg.provider === 'mock' || !cfg.apiKey) {
      const content = sanitizeLlmOutput(mockChat(messages, opts.task));
      return { content, tokens: Math.ceil(content.length / 3), provider: 'mock', model: cfg.model };
    }

    // 总时长硬预算：单次 chat() 全部分支累计超过即主动抛错，不无限等待
    const budgetMs = env.llmMaxTotalMs;
    const budgetStarted = Date.now();
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= env.llmMaxRetries; attempt++) {
      // 分级递增超时：基础超时 × 倍数^attempt（并加抖动错峰）
      const jitter = BASE_TIMEOUT_JITTER_RATIO * Math.random();
      const tierMs = env.llmTimeoutMs * Math.pow(env.llmTimeoutMul, attempt) * (1 + jitter);
      const spent = Date.now() - budgetStarted;
      const remaining = budgetMs - spent;
      // 总时长硬预算兜底：无法再给任何分支分配有效时间 → 主动抛异常，交给断点续跑从失败处继续
      if (remaining <= 10_000) {
        const msg = `LLM 调用超出总时长预算（${Math.round(budgetMs / 60000)} 分钟），已抛出异常终止该步骤（可重新启动以断点续跑）`;
        this.logger.error(msg);
        this.track('timeout');
        throw new Error(msg);
      }
      const timeoutMs = Math.max(1, Math.min(tierMs, remaining));

      try {
        // 强制进入串行/限流闸门，避免并放大超时
        const result = await this.withSlot(() => this.request(cfg, messages, opts, timeoutMs));
        this.track('ok');
        return result;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const isTimeout = lastErr.message.includes('超时') || lastErr.message.includes('预算');
        const isBudgetExceeded = lastErr.message.includes('预算');
        this.track(isTimeout ? 'timeout' : 'error');

        if (isBudgetExceeded || !isTimeout || attempt >= env.llmMaxRetries) {
          this.logger.error(`LLM 调用最终失败（第 ${attempt + 1} 次）：${lastErr.message}`);
          throw lastErr;
        }
        this.logger.warn(
          `LLM 调用第 ${attempt + 1} 次超时（超时 ${Math.round(timeoutMs / 1000)}s），重试第 ${attempt + 2} 次（超时放大至 ${Math.round(Math.min(tierMs * 2, budgetMs) / 1000)}s）`,
        );
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
    // AbortController 必须覆盖到响应体读取完成：reasoning 模型（如 MiniMax M3）会先返回响应头再长时间生成，
    // 若在收到响应头后就清除定时器，body 流式读取可能无限挂起，导致运行假死被 watchdog 标记失败。
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
          // 写作类任务强制关闭思考模式，减少 <think>/英文自检泄漏进正文
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
            /** 部分推理模型把思考放在独立字段，绝不能拼进标书正文 */
            reasoning_content?: string | null;
            reasoning?: string | null;
          };
        }[];
        usage?: { total_tokens?: number };
      };
      const msg = data.choices?.[0]?.message;
      // 只用 content；reasoning_* 仅供模型内部，写标书必须丢弃
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