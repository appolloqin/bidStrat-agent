import { Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BidResponse, BidSection, EditFeedback, Project, Requirement } from '../entities';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { classifyFeedbackAction } from '../common/diff';
import { nextId } from '../common/snowflake';
import { AgentService } from '../agent/agent.service';
import { LlmService } from '../llm/llm.service';
import { ComplianceFinding, SaveSectionFeedbackInput, SelfReviewResult } from '@bidstrat/shared';
import { z } from 'zod';

export const RewriteSectionDtoSchema = z.object({ instruction: z.string().min(1) });
export class RewriteSectionDto {
  instruction!: string;
}

export const FeedbackDtoSchema = z.object({
  finalContent: z.string(),
  rating: z.enum(['GOOD', 'OK', 'REWRITE']).optional(),
  comment: z.string().optional(),
});

@Controller('sections')
export class SectionsController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly agent: AgentService,
    private readonly llm: LlmService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('projectId') projectId: string) {
    if (!projectId) throw new NotFoundException('缺少 projectId');
    const project = await this.dataSource
      .getRepository(Project)
      .findOne({ where: { id: projectId, tenantId: user.tenantId } });
    if (!project) throw new NotFoundException('项目不存在');
    return this.dataSource
      .getRepository(BidSection)
      .find({ where: { tenantId: user.tenantId, projectId }, order: { outlineNo: 'ASC' } });
  }

  @Get(':id')
  async getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const s = await this.dataSource
      .getRepository(BidSection)
      .findOne({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException('章节不存在');
    const feedbacks = await this.dataSource
      .getRepository(EditFeedback)
      .find({ where: { sectionId: id }, order: { createdAt: 'DESC' }, take: 20 });
    return { ...s, feedbacks };
  }

  @Post(':id/rewrite')
  async rewrite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RewriteSectionDto,
  ) {
    const repo = this.dataSource.getRepository(BidSection);
    const s = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException('章节不存在');
    const updated = await this.agent.rewriteSection(user.tenantId, id, dto.instruction);
    await this.audit.log(user.tenantId, user, 'section.rewrite', 'section', id, { instruction: dto.instruction });
    return updated;
  }

  @Post(':id/review')
  async review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ result: SelfReviewResult; findings: ComplianceFinding[] }> {
    const repo = this.dataSource.getRepository(BidSection);
    const s = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException('章节不存在');
    const reqs = await this.dataSource
      .getRepository(Requirement)
      .find({ where: { projectId: s.projectId } });
    const result = await this.selfReview(s.title, s.content ?? '', reqs.map((r) => r.content), user.tenantId);
    s.reviewScore = result.score;
    await repo.save(s);
    const findings = await this.checkSectionCompliance(user.tenantId, s.projectId);
    return { result: { score: result.score, lostPoints: result.lostPoints, suggestions: result.suggestions }, findings };
  }

  private async selfReview(
    title: string,
    content: string,
    requirements: string[],
    tenantId?: string,
  ): Promise<SelfReviewResult & { tokens: number }> {
    const { content: raw, tokens } = await this.llm.chat(
      [
        {
          role: 'system',
          content:
            '你是评标专家。以评分标准检查章节质量，输出 JSON：{score:0-100, lostPoints:string[], suggestions:string[]}。只输出 JSON。',
        },
        {
          role: 'user',
          content: `章节：${title}\n\n招标要点：\n${requirements.join('\n')}\n\n章节内容：\n${content.slice(0, 4000)}`,
        },
      ],
      { task: 'self_review', tenantId },
    );
    void tokens;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : raw) as SelfReviewResult;
      return {
        score: Number(parsed.score) || 0,
        lostPoints: Array.isArray(parsed.lostPoints) ? parsed.lostPoints.map(String) : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
        tokens,
      };
    } catch {
      return { score: 75, lostPoints: ['解析自评结果失败'], suggestions: ['人工复核该章节'], tokens };
    }
  }

  private async checkSectionCompliance(tenantId: string, projectId: string): Promise<ComplianceFinding[]> {
    const reqs = await this.dataSource.getRepository(Requirement).find({ where: { projectId, tenantId } });
    const resps = await this.dataSource.getRepository(BidResponse).find({ where: { projectId, tenantId } });
    const sections = await this.dataSource.getRepository(BidSection).find({ where: { projectId, tenantId } });
    const respMap = new Map(resps.map((r) => [r.requirementId, r]));
    const findings: ComplianceFinding[] = [];
    for (const req of reqs) {
      const resp = respMap.get(req.id);
      if (!resp || !resp.content) {
        findings.push({ level: req.mandatory ? 'RED' : 'YELLOW', category: req.category, message: `要点未应答：${req.content.slice(0, 60)}` });
        continue;
      }
      if (req.category === 'DISQUALIFIER' && resp.conclusion !== 'FULLY_MET') {
        findings.push({ level: 'RED', category: req.category, message: `废标项未完全满足：${req.content.slice(0, 60)}` });
      } else if (resp.conclusion === 'NOT_MET' && req.mandatory) {
        findings.push({ level: 'RED', category: req.category, message: `强制要点不满足：${req.content.slice(0, 60)}` });
      } else if (resp.conclusion === 'PARTIALLY_MET' || resp.conclusion === 'DEVIATION') {
        findings.push({ level: 'YELLOW', category: req.category, message: `存在偏离/部分满足：${req.content.slice(0, 60)}` });
      }
    }
    for (const s of sections) {
      if (!s.content) {
        findings.push({ level: 'RED', category: 'SECTION', message: `章节【${s.title}】无内容`, refSectionId: s.id });
      } else if ((s.reviewScore ?? 100) < 70) {
        findings.push({ level: 'YELLOW', category: 'SECTION', message: `章节【${s.title}】自评分较低（${s.reviewScore}）`, refSectionId: s.id });
      }
    }
    if (findings.length === 0) {
      findings.push({ level: 'GREEN', category: 'ALL', message: '全部要点已覆盖，未发现漏项或废标风险' });
    }
    return findings;
  }

  @Put(':id/feedback')
  async saveFeedback(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SaveSectionFeedbackInput,
  ) {
    const repo = this.dataSource.getRepository(BidSection);
    const s = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException('章节不存在');
    const before = s.content ?? '';
    const after = dto.finalContent;
    const action = classifyFeedbackAction(before, after);
    const fb = this.dataSource.getRepository(EditFeedback).create({
      id: nextId(),
      tenantId: user.tenantId,
      projectId: s.projectId,
      sectionId: id,
      beforeContent: before,
      afterContent: after,
      action,
      rating: dto.rating ?? null,
      comment: dto.comment ?? null,
      createdBy: user.sub,
    });
    await this.dataSource.getRepository(EditFeedback).save(fb);
    s.content = after;
    s.finalVersion += 1;
    s.status = 'FINALIZED';
    await repo.save(s);
    await this.audit.log(user.tenantId, user, 'section.feedback', 'section', id, { action, rating: dto.rating });
    return { section: s, feedback: fb };
  }
}