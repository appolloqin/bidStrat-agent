import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { sanitizeLlmOutput } from '../../common/llm-parsing';
import { detectContentDefects, hardScoreCap } from '../../common/content-quality';
import { SelfReviewResult } from '@bidstrat/shared';
import { AgentTool, ToolContext, ToolResult } from './tool.interface';

@Injectable()
export class SelfReviewTool implements AgentTool<{ title: string; content: string; requirements: string[] }> {
  readonly name = 'self_review' as const;

  constructor(private readonly llm: LlmService) {}

  async run(ctx: ToolContext, input: { title: string; content: string; requirements: string[] }): Promise<ToolResult> {
    const result = await this.review(input.title, input.content, input.requirements, ctx.tenantId);
    return { output: result, tokens: result.tokens };
  }

  async review(
    title: string,
    content: string,
    requirements: string[],
    tenantId?: string,
  ): Promise<SelfReviewResult & { tokens: number }> {
    // 1) 硬规则先看「原文」——不得先 sanitize 再评，否则英文思考会被藏起来导致漏检
    const defects = detectContentDefects(content);
    const cap = hardScoreCap(defects);

    // 2) LLM 只评清洗后的业务正文质量（要点覆盖等）
    const cleanContent = sanitizeLlmOutput(content);
    const { content: raw, tokens } = await this.llm.chat(
      [
        {
          role: 'system',
          content: [
            '你是评标专家。检查章节是否实质响应招标要点、结构完整、表述正式。',
            '必须检查并扣分：正文含英文思考/自检、Markdown 噪音、截断残篇、「详见附件」推诿、空壳标题无实质内容。',
            '只输出 JSON：{score:0-100, lostPoints:string[], suggestions:string[]}，不要其他文字。',
          ].join(''),
        },
        {
          role: 'user',
          content: `章节：${title}\n\n招标要点：\n${requirements.join('\n') || '（无分类要点，按通用完整性评分）'}\n\n章节内容：\n${cleanContent.slice(0, 6000)}\n\n${
            defects.length
              ? `系统已检出硬缺陷（必须在 lostPoints/suggestions 中体现并严扣分）：\n${defects.map((d) => `- ${d.message}`).join('\n')}`
              : ''
          }`,
        },
      ],
      { task: 'self_review', tenantId },
    );

    let score = 0;
    let lostPoints: string[] = [];
    let suggestions: string[] = [];

    try {
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : raw) as SelfReviewResult;
      score = Number(parsed.score) || 0;
      lostPoints = Array.isArray(parsed.lostPoints) ? parsed.lostPoints.map(String) : [];
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [];
    } catch {
      // 解析失败不得给「及格边缘分」，否则会跳过重写门控
      score = 40;
      lostPoints = ['自评 JSON 解析失败，按不合格处理'];
      suggestions = ['重新生成该章节并确保输出完整中文正文'];
    }

    for (const d of defects) {
      if (!lostPoints.some((x) => x.includes(d.message.slice(0, 12)))) {
        lostPoints.push(d.message);
      }
      suggestions.push(`消除缺陷[${d.code}]后重写`);
    }
    if (cap !== null) score = Math.min(score, cap);

    return { score, lostPoints, suggestions: [...new Set(suggestions)], tokens };
  }
}
