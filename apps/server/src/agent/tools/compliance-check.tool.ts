import { Injectable } from '@nestjs/common';
import { BidResponse, BidSection, Requirement } from '../../entities';
import { ComplianceFinding } from '@bidstrat/shared';
import { detectContentDefects } from '../../common/content-quality';
import { AgentTool, ToolContext, ToolResult } from './tool.interface';

@Injectable()
export class ComplianceCheckTool implements AgentTool {
  readonly name = 'compliance_check' as const;

  async run(ctx: ToolContext): Promise<ToolResult> {
    const reqRepo = ctx.dataSource.getRepository(Requirement);
    const respRepo = ctx.dataSource.getRepository(BidResponse);
    const sectionRepo = ctx.dataSource.getRepository(BidSection);

    const requirements = await reqRepo.find({ where: { projectId: ctx.projectId } });
    const responses = await respRepo.find({ where: { projectId: ctx.projectId } });
    const sections = await sectionRepo.find({ where: { projectId: ctx.projectId } });
    const respByReq = new Map(responses.map((r) => [r.requirementId, r]));

    const findings: ComplianceFinding[] = [];
    for (const req of requirements) {
      const resp = respByReq.get(req.id);
      if (!resp || !resp.content) {
        findings.push({
          level: req.mandatory ? 'RED' : 'YELLOW',
          category: req.category,
          message: `要点未应答：${req.content.slice(0, 60)}`,
          refClauseId: req.clauseId ?? undefined,
        });
        continue;
      }
      if (req.category === 'DISQUALIFIER' && resp.conclusion !== 'FULLY_MET') {
        findings.push({
          level: 'RED',
          category: req.category,
          message: `废标项未完全满足：${req.content.slice(0, 60)}`,
          refClauseId: req.clauseId ?? undefined,
        });
      } else if (resp.conclusion === 'NOT_MET' && req.mandatory) {
        findings.push({
          level: 'RED',
          category: req.category,
          message: `强制要点不满足：${req.content.slice(0, 60)}`,
        });
      } else if (resp.conclusion === 'PARTIALLY_MET' || resp.conclusion === 'DEVIATION') {
        findings.push({
          level: 'YELLOW',
          category: req.category,
          message: `存在偏离/部分满足：${req.content.slice(0, 60)}`,
        });
      }
    }

    for (const s of sections) {
      if (!s.content?.trim()) {
        findings.push({ level: 'RED', category: 'SECTION', message: `章节【${s.title}】无内容`, refSectionId: s.id });
        continue;
      }

      // 正文形态硬检：英文思考泄漏、截断、推诿等（此前合规完全不看正文质量）
      const defects = detectContentDefects(s.content);
      for (const d of defects) {
        const level = d.code === 'DEFERRAL' ? 'YELLOW' : 'RED';
        findings.push({
          level,
          category: 'SECTION',
          message: `章节【${s.title}】${d.message}`,
          refSectionId: s.id,
        });
      }

      if ((s.reviewScore ?? 100) < 70) {
        findings.push({
          level: 'YELLOW',
          category: 'SECTION',
          message: `章节【${s.title}】自评分较低（${s.reviewScore}）`,
          refSectionId: s.id,
        });
      }
    }

    if (findings.length === 0) {
      findings.push({ level: 'GREEN', category: 'ALL', message: '全部要点已覆盖，未发现漏项或废标风险' });
    }
    const summary = {
      red: findings.filter((f) => f.level === 'RED').length,
      yellow: findings.filter((f) => f.level === 'YELLOW').length,
      green: findings.filter((f) => f.level === 'GREEN').length,
    };
    return { output: { findings, summary } };
  }
}
