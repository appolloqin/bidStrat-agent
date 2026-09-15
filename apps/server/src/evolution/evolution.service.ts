import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExperienceCardRule } from '@bidstrat/shared';
import { BidSection, EditFeedback, ExperienceCard, Memory, Project, Skill } from '../entities';
import { nextId } from '../common/snowflake';
import { hashEmbed } from '../common/vector';
import { extractJson } from '../common/llm-parsing';
import { LlmService } from '../llm/llm.service';
import { EvalService } from '../eval/eval.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class EvolutionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly llm: LlmService,
    private readonly evalService: EvalService,
    private readonly audit: AuditService,
  ) {}

  async reviewProject(tenantId: string, projectId: string, operatorId: string): Promise<ExperienceCard[]> {
    const feedbackRepo = this.dataSource.getRepository(EditFeedback);
    const feedbacks = await feedbackRepo.find({ where: { tenantId, projectId }, order: { createdAt: 'ASC' } });
    const project = await this.dataSource.getRepository(Project).findOne({ where: { id: projectId } });
    if (feedbacks.length === 0) return [];

    const sectionRepo = this.dataSource.getRepository(BidSection);
    const cards: ExperienceCard[] = [];
    for (const fb of feedbacks.slice(0, 10)) {
      const section = await sectionRepo.findOne({ where: { id: fb.sectionId } });
      const { content } = await this.llm.chat(
        [
          {
            role: 'system',
            content:
              '你是标书质量复盘专家。基于人工修订反馈提炼结构化经验卡，输出 JSON：{scenario, before, after, rule, target}，target 取 SEMANTIC_MEMORY/SKILL/EPISODIC_MEMORY 之一。只输出 JSON。',
          },
          {
            role: 'user',
            content: `章节：${section?.title ?? '未知'}\n修订类型：${fb.action}\n评分：${fb.rating ?? '-'}\n批注：${fb.comment ?? '-'}\n\nAI 原稿：\n${(fb.beforeContent ?? '').slice(0, 1500)}\n\n人工定稿：\n${(fb.afterContent ?? '').slice(0, 1500)}`,
          },
        ],
        { task: 'evolve', tenantId },
      );
      let rule: ExperienceCardRule;
      const parsed = extractJson<Partial<ExperienceCardRule>>(content);
      if (parsed && (parsed.scenario || parsed.rule)) {
        rule = {
          scenario: parsed.scenario ?? section?.title ?? '未知场景',
          before: parsed.before ?? (fb.beforeContent ?? '').slice(0, 200),
          after: parsed.after ?? (fb.afterContent ?? '').slice(0, 200),
          rule: parsed.rule ?? fb.comment ?? '人工修订规律待提炼',
          target: (parsed.target as ExperienceCardRule['target']) ?? 'SEMANTIC_MEMORY',
        };
      } else {
        rule = {
          scenario: section?.title ?? '未知场景',
          before: (fb.beforeContent ?? '').slice(0, 200),
          after: (fb.afterContent ?? '').slice(0, 200),
          rule: fb.comment ?? '人工修订规律待提炼',
          target: 'SEMANTIC_MEMORY',
        };
      }
      const card = await this.dataSource.getRepository(ExperienceCard).save({
        id: nextId(),
        tenantId,
        projectId,
        scenario: String(rule.scenario ?? '未命名场景'),
        before: rule.before ?? null,
        after: rule.after ?? null,
        rule: String(rule.rule ?? ''),
        target: rule.target ?? 'SEMANTIC_MEMORY',
        evidence: { feedbackId: fb.id, action: fb.action, won: project?.won ?? null },
        confidence: project?.won === true ? 0.8 : 0.5,
        gateStatus: 'PENDING',
      });
      cards.push(card);
    }
    await this.audit.log(tenantId, { sub: operatorId }, 'evolution.review', 'project', projectId, { cards: cards.length });
    return cards;
  }

  async approve(tenantId: string, cardId: string, operator: { sub: string; username: string }): Promise<ExperienceCard> {
    const cardRepo = this.dataSource.getRepository(ExperienceCard);
    const card = await cardRepo.findOne({ where: { id: cardId, tenantId } });
    if (!card) throw new NotFoundException('经验卡不存在');
    if (card.gateStatus !== 'PENDING') throw new Error(`当前状态 ${card.gateStatus} 不可批准`);

    card.gateStatus = 'EVAL_RUNNING';
    await cardRepo.save(card);

    const report = await this.evalService.runRegression(tenantId, `经验卡回归-${card.id}`, card.id);
    if (!report.passed) {
      card.gateStatus = 'REJECTED';
      await cardRepo.save(card);
      throw new Error('评估回归未通过，已自动拒绝');
    }
    card.gateStatus = 'EVAL_PASSED';
    await cardRepo.save(card);

    if (card.target === 'SKILL') {
      const skillRepo = this.dataSource.getRepository(Skill);
      const existing = await skillRepo.findOne({ where: { tenantId, name: card.scenario, status: 'ACTIVE' } });
      if (existing) {
        existing.status = 'DISABLED';
        await skillRepo.save(existing);
      }
      const skill = await skillRepo.save({
        id: nextId(),
        tenantId,
        name: card.scenario.slice(0, 60),
        trigger: card.scenario.slice(0, 30),
        promptTpl: card.rule,
        tools: ['write_section'],
        version: (existing?.version ?? 0) + 1,
        status: 'ACTIVE',
        parentId: existing?.id ?? null,
        sourceCardId: card.id,
      });
      card.appliedTargetId = skill.id;
    } else {
      const memoryRepo = this.dataSource.getRepository(Memory);
      const memory = await memoryRepo.save({
        id: nextId(),
        tenantId,
        memType: card.target === 'EPISODIC_MEMORY' ? 'EPISODIC' : 'SEMANTIC',
        content: card.rule,
        tags: [card.scenario.slice(0, 20)],
        embedding: hashEmbed(card.rule),
        confidence: card.confidence,
        version: 1,
        status: 'ACTIVE',
        sourceCardId: card.id,
      });
      card.appliedTargetId = memory.id;
    }

    card.gateStatus = 'APPROVED';
    card.decidedBy = operator.sub;
    card.decidedAt = new Date();
    await cardRepo.save(card);
    await this.audit.log(tenantId, operator, 'evolution.approve', 'experience_card', card.id, {
      target: card.target,
      appliedTargetId: card.appliedTargetId,
      evalReportId: report.id,
    });
    return card;
  }

  async reject(tenantId: string, cardId: string, operator: { sub: string; username: string }): Promise<ExperienceCard> {
    const cardRepo = this.dataSource.getRepository(ExperienceCard);
    const card = await cardRepo.findOne({ where: { id: cardId, tenantId } });
    if (!card) throw new NotFoundException('经验卡不存在');
    if (card.gateStatus !== 'PENDING') throw new Error(`当前状态 ${card.gateStatus} 不可拒绝`);
    card.gateStatus = 'REJECTED';
    card.decidedBy = operator.sub;
    card.decidedAt = new Date();
    await cardRepo.save(card);
    await this.audit.log(tenantId, operator, 'evolution.reject', 'experience_card', card.id);
    return card;
  }
}
