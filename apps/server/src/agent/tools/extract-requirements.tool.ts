import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { Clause, Requirement, TenderDoc } from '../../entities';
import { nextId } from '../../common/snowflake';
import { LlmService } from '../../llm/llm.service';
import { RequirementCategorySchema, RequirementCategory } from '@bidstrat/shared';
import { AgentTool, ToolContext, ToolResult } from './tool.interface';

@Injectable()
export class ExtractRequirementsTool implements AgentTool {
  readonly name = 'extract_requirements' as const;

  constructor(private readonly llm: LlmService) {}

  async run(ctx: ToolContext): Promise<ToolResult> {
    const clauseRepo = ctx.dataSource.getRepository(Clause);
    const reqRepo = ctx.dataSource.getRepository(Requirement);
    const docRepo = ctx.dataSource.getRepository(TenderDoc);
    const docs = await docRepo.find({
      where: { tenantId: ctx.tenantId, projectId: ctx.projectId },
      order: { createdAt: 'DESC' },
    });
    const docIds = docs.map((d) => d.id);
    const clauses = docIds.length
      ? await clauseRepo.find({ where: { docId: In(docIds) }, order: { createdAt: 'ASC' } })
      : [];
    const projectClauses = clauses.slice(0, 200);
    const clauseText = projectClauses
      .map((c) => `【${c.sectionPath}】${c.content}`)
      .join('\n')
      .slice(0, 8000);

    const { content, tokens } = await this.llm.chat(
      [
        {
          role: 'system',
          content:
            '你是招标文件分析专家。从给定条款中提取招标要点，输出 JSON 数组，每项含 category(QUALIFICATION/TECHNICAL/COMMERCIAL/SCORING/DELIVERY/DISQUALIFIER 六类之一)、content、mandatory(布尔)。只输出 JSON。',
        },
        { role: 'user', content: `条款如下：\n${clauseText || '（无条款，输出通用六类要点）'}` },
      ],
      { task: 'extract_requirements', tenantId: ctx.tenantId },
    );

    const items = this.parseItems(content);
    await reqRepo.delete({ projectId: ctx.projectId, confirmed: false });
    const saved = await reqRepo.save(
      items.map((it, i) => ({
        id: nextId(),
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        clauseId: null,
        category: it.category,
        content: it.content,
        mandatory: it.mandatory,
        confirmed: false,
        sortOrder: i,
      })),
    );
    return { output: { count: saved.length, items: saved.map((s) => ({ id: s.id, category: s.category, content: s.content, mandatory: s.mandatory })) }, tokens };
  }

  private parseItems(content: string): { category: RequirementCategory; content: string; mandatory: boolean }[] {
    try {
      const m = content.match(/\[[\s\S]*\]/);
      const raw = JSON.parse(m ? m[0] : content) as unknown[];
      const valid = new Set<string>(RequirementCategorySchema.options as readonly string[]);
      return raw
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x.content === 'string')
        .map((x) => ({
          category: (valid.has(String(x.category)) ? x.category : 'TECHNICAL') as RequirementCategory,
          content: String(x.content),
          mandatory: Boolean(x.mandatory),
        }));
    } catch {
      return [
        { category: 'QUALIFICATION', content: '投标人须具备独立法人资格', mandatory: true },
        { category: 'TECHNICAL', content: '提供完整技术方案', mandatory: true },
        { category: 'COMMERCIAL', content: '报价不得超过预算上限', mandatory: true },
        { category: 'DISQUALIFIER', content: '未按要求提交将导致废标', mandatory: true },
      ];
    }
  }
}
