import { Injectable } from '@nestjs/common';
import { RequirementCategory } from '@bidstrat/shared';
import { BidSection, Requirement, BidResponse, Skill } from '../../entities';
import { nextId } from '../../common/snowflake';
import { sanitizeLlmOutput } from '../../common/llm-parsing';
import { LlmService } from '../../llm/llm.service';
import { KnowledgeService, KnowledgeHit } from '../../kb/knowledge.service';
import { AgentTool, ToolContext, ToolResult } from './tool.interface';

export interface WriteSectionInput {
  outlineNo: string;
  title: string;
  /** 限定该章节响应的要点类别；为空表示不筛选 */
  categories?: RequirementCategory[];
  /** 精确指定要点（优先于 categories）——对应招标文件位置上的要点 */
  requirementIds?: string[];
  /** 招标文件中的对应位置（章节路径） */
  tenderAnchor?: string;
  /** 规划阶段给出的写作依据摘要 */
  context?: string;
}

/** 全章共用一套写作规范，不为某一模板单独定制提示词 */
const WRITE_FORMAT_RULES = [
  '你是资深中文标书撰写专家。',
  '任务：按给定的招标原文位置，撰写可直接用于投标文件的中文应答正文。',
  '只输出最终中文应答正文，禁止输出任何思考过程、英文、meta 评论、memory/memories JSON、<memory> 标签。',
  '禁止输出「章节定位与响应」类自我说明；禁止复述填写须知类套话。',
  '不要大段照抄招标要求/评分标准原文，应基于它们作实质性应答。',
  '语言正式、客观、可审计；呼应给定要点与依据；禁止编造企业资质事实。',
  '只用纯文本，禁止 Markdown（井号、星号、减号列表符、竖线、反引号、代码块）。',
  '用「一、」「（一）」「1.」「（1）」等中文层级编号；并列项用「1）」「2）」。',
  '不要出现“详见附件”“待补”“待填”等推诿表述；确需待定数据可用「【待填：具体数值】」且尽量少。',
].join('');

function isUsableHit(h: KnowledgeHit): boolean {
  const c = h.content || '';
  if (/<memory>|<\/memory>|\{"memories"\s*:/i.test(c)) return false;
  if (/category"\s*:\s*"workflow"/i.test(c)) return false;
  const letters = c.replace(/\s/g, '');
  if (letters.length > 80) {
    const en = (letters.match(/[A-Za-z]/g) || []).length;
    const zh = (letters.match(/[\u4e00-\u9fff]/g) || []).length;
    if (en > zh * 2) return false;
  }
  return true;
}

@Injectable()
export class WriteSectionTool implements AgentTool<WriteSectionInput> {
  readonly name = 'write_section' as const;

  constructor(
    private readonly llm: LlmService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async run(ctx: ToolContext, input: WriteSectionInput): Promise<ToolResult> {
    const reqRepo = ctx.dataSource.getRepository(Requirement);
    const respRepo = ctx.dataSource.getRepository(BidResponse);
    const skillRepo = ctx.dataSource.getRepository(Skill);

    const allRequirements = await reqRepo.find({ where: { projectId: ctx.projectId }, order: { sortOrder: 'ASC' } });
    const requirements = input.requirementIds?.length
      ? allRequirements.filter((r) => input.requirementIds!.includes(r.id))
      : input.categories?.length
        ? allRequirements.filter((r) => input.categories!.includes(r.category))
        : allRequirements;
    const allResponses = await respRepo.find({ where: { projectId: ctx.projectId } });
    const reqIdSet = new Set(requirements.map((r) => r.id));
    const responses = allResponses.filter((r) => reqIdSet.has(r.requirementId));
    const skills = await skillRepo.find({ where: { tenantId: ctx.tenantId, status: 'ACTIVE' } });

    const hits = (await this.knowledge.search(ctx.tenantId, `${input.tenderAnchor ?? ''} ${input.title}`, 6)).filter(
      isUsableHit,
    );
    const matchedSkill = skills.find(
      (s) => s.trigger && (input.title.includes(s.trigger) || s.trigger.includes(input.title)),
    );

    const content = await this.writeDraft(
      input.title,
      requirements,
      responses,
      hits,
      ctx.tenantId,
      matchedSkill?.promptTpl,
      input.tenderAnchor,
      input.context,
    );
    const section = await this.upsertSection(ctx, input, content.text);
    const tokens = content.tokens;
    return { output: { sectionId: section.id, reviewScore: section.reviewScore }, tokens };
  }

  async writeDraft(
    title: string,
    requirements: Requirement[],
    responses: BidResponse[],
    hits: KnowledgeHit[],
    tenantId?: string,
    skillTpl?: string | null,
    tenderAnchor?: string,
    context?: string,
  ): Promise<{ text: string; tokens: number }> {
    const reqText = requirements.map((r, i) => `${i + 1}. [${r.category}] ${r.content}`).join('\n');
    const respText = responses
      .map((r) => {
        const req = requirements.find((x) => x.id === r.requirementId);
        return `- 针对「${req?.content?.slice(0, 40) ?? r.requirementId}」：${r.conclusion ?? ''} ${sanitizeLlmOutput(r.content ?? '').slice(0, 300)}`;
      })
      .join('\n')
      .slice(0, 2500);
    const kbText =
      hits
        .map((h) => `- ${h.type === 'KB' ? '企业素材' : '经验要点'}：${sanitizeLlmOutput(h.content).slice(0, 180)}`)
        .join('\n') || '（无）';
    const { content, tokens } = await this.llm.chat(
      [
        {
          role: 'system',
          content: `${WRITE_FORMAT_RULES}${skillTpl ? `\n遵循写作技能：${skillTpl}` : ''}`,
        },
        {
          role: 'user',
          content: [
            `写作标题：${title}`,
            `原文锚点：${tenderAnchor || title}`,
            context ? `\n写作依据：\n${context}` : '',
            '',
            '相关招标要点：',
            reqText || '（无，请依据上方写作依据作答）',
            '',
            '已有应答矩阵（可吸收，勿照抄英文/标记）：',
            respText || '（无）',
            '',
            '可用企业素材（仅事实参考，禁止编造）：',
            kbText,
            '',
            '直接输出中文应答正文。',
          ].join('\n'),
        },
      ],
      { task: 'write_section', tenantId },
    );
    return { text: sanitizeLlmOutput(content), tokens };
  }

  async rewrite(
    ctx: ToolContext,
    section: BidSection,
    instruction: string,
  ): Promise<{ text: string; tokens: number }> {
    const hits = (await this.knowledge.search(ctx.tenantId, section.title, 5)).filter(isUsableHit);
    const kbText = hits.map((h) => `- ${sanitizeLlmOutput(h.content).slice(0, 150)}`).join('\n');
    const current = sanitizeLlmOutput(section.content ?? '');
    const { content, tokens } = await this.llm.chat(
      [
        {
          role: 'system',
          content: WRITE_FORMAT_RULES,
        },
        {
          role: 'user',
          content: `请按下列意见修订章节「${section.title}」：\n${instruction}\n\n原文：\n${current}\n\n参考素材：\n${kbText || '（无）'}\n\n直接输出修订后的中文正文。`,
        },
      ],
      { task: 'rewrite_section', tenantId: ctx.tenantId },
    );
    return { text: sanitizeLlmOutput(content), tokens };
  }

  private async upsertSection(ctx: ToolContext, input: WriteSectionInput, content: string): Promise<BidSection> {
    const sectionRepo = ctx.dataSource.getRepository(BidSection);
    let section = await sectionRepo.findOne({
      where: { projectId: ctx.projectId, title: input.title },
    });
    if (!section) {
      section = sectionRepo.create({
        id: nextId(),
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        outlineNo: input.outlineNo,
        title: input.title,
        content: '',
        genVersion: 0,
        finalVersion: 0,
        reviewScore: null,
        status: 'GENERATED',
        tenderAnchor: null,
      });
    }
    section.outlineNo = input.outlineNo;
    section.content = content;
    section.genVersion = (section.genVersion ?? 0) + 1;
    section.status = 'GENERATED';
    section.tenderAnchor = input.tenderAnchor ?? section.tenderAnchor ?? null;
    await sectionRepo.save(section);
    return section;
  }
}
