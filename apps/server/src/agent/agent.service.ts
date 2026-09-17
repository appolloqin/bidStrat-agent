import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { AgentPlanStep, AgentProgressEvent, ProjectStage } from '@bidstrat/shared';
import { AgentRun, AgentStep, BidResponse, BidSection, Clause, Project, Requirement, TenderDoc } from '../entities';
import { nextId } from '../common/snowflake';
import { env } from '../config/env';
import { AgentEventsService } from './agent-events.service';
import { ToolRegistry } from './tool.registry';
import { ToolContext } from './tools/tool.interface';
import { WriteSectionTool } from './tools/write-section.tool';
import { SelfReviewTool } from './tools/self-review.tool';
import { LlmService } from '../llm/llm.service';
import { buildPlan, buildOutlineFromTenderPositions } from './plan';
import { planWritingByLlm } from './plan-writing';
import { isFillInstructionOnly } from './response-slots';
import { parseDraftResponse } from '../common/llm-parsing';

export interface RunOptions {
  skipHumanCheckpoints?: boolean;
  /** 是否断点续跑（startRun 发现未完成任务时由后端置位，用于阶段内跳过已完成产出） */
  resuming?: boolean;
  /** 导出时是否在源招标文件上插入应答；默认 true */
  annotateOnSource?: boolean;
}

@Injectable()
export class AgentService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgentService.name);
  private readonly running = new Set<string>();
  private watchdogTimer: NodeJS.Timeout | null = null;
  private readonly watchdogMs = 30_000;
  /** 本进程启动时刻：用于孤儿回收宽限，避免热恢复尚未登记心跳时被误杀 */
  private bootedAt = Date.now();
  // —— 探活式僵尸监控（不再用“无活动时间阈值”猜测）——
  // runBeats 记录进程内每个运行最近一次心跳时间戳（execute 登记、每 15s 心跳刷新、退出即删除）。
  // 判定：
  //   1) runBeats 中存在且心跳新鲜 → 事件循环活着、运行推进中 → 跳过；
  //   2) runBeats 中存在但心跳过期 → 事件循环卡死（真僵）→ 标记 FAILED；
  //   3) runBeats 中不存在（进程重启/异常退出残留）→ 孤儿 → 启动时优先热恢复，宽限后仍无心跳再回收。
  private readonly runBeats = new Map<string, number>();
  /** 心跳过期阈值：15s 心跳间隔的 3 倍，留足节拍余量 */
  private readonly beatStaleMs = 45_000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly registry: ToolRegistry,
    private readonly events: AgentEventsService,
    private readonly writeSection: WriteSectionTool,
    private readonly selfReview: SelfReviewTool,
    private readonly llm: LlmService,
  ) {}

  private touch(run: AgentRun, stepId?: string, extra?: Partial<AgentRun>): Promise<void> {
    run.lastActivityAt = new Date();
    if (stepId !== undefined) run.currentStepId = stepId;
    if (extra) Object.assign(run, extra);
    return this.dataSource.getRepository(AgentRun).save(run).then(() => undefined);
  }

  async startRun(projectId: string, tenantId: string, options: RunOptions): Promise<AgentRun> {
    const projectRepo = this.dataSource.getRepository(Project);
    const project = await projectRepo.findOne({ where: { id: projectId, tenantId } });
    if (!project) throw new NotFoundException('项目不存在');
    if (this.running.has(projectId)) throw new Error('该项目已有正在执行的任务');

    const runRepo = this.dataSource.getRepository(AgentRun);
    // 仅当「全局最近一次」仍是未完成状态时才断点续跑；
    // 避免成功之后又误续跑更早的 FAILED，导致 UI 仍显示上一轮完成态。
    const latest = await runRepo
      .createQueryBuilder('r')
      .where('r.project_id = :projectId', { projectId })
      .andWhere('r.tenant_id = :tenantId', { tenantId })
      .orderBy('r.started_at', 'DESC')
      .getOne();

    const unfinished =
      latest &&
      ['PENDING', 'RUNNING', 'FAILED', 'WAITING_HUMAN'].includes(latest.status) &&
      (latest.plan?.length ?? 0) > 0
        ? latest
        : null;

    let run: AgentRun;
    let resuming = false;
    if (unfinished) {
      run = unfinished;
      run.status = 'RUNNING';
      run.error = null;
      run.finishedAt = null;
      run.lastActivityAt = new Date();
      // 定位下一个未完成步骤作为 currentStepId
      const next = (run.plan ?? []).find((s) => s.status !== 'DONE');
      run.currentStepId = next?.id ?? run.plan?.[run.plan.length - 1]?.id ?? null;
      for (const s of run.plan ?? []) if (s.status === 'FAILED') s.status = 'RUNNING';
      resuming = true;
    } else {
      run = runRepo.create({
        id: nextId(),
        tenantId,
        projectId,
        status: 'RUNNING',
        plan: buildPlan(),
        currentStepId: null,
        totalTokens: 0,
        startedAt: new Date(),
      });
      resuming = false;
    }
    run = await runRepo.save(run);

    this.running.add(projectId);
    // 在任何 await 之前登记心跳，堵住 save(RUNNING) → execute 首个 await 之间的看门狗误杀窗口
    this.runBeats.set(run.id, Date.now());
    void this.execute(run.id, { ...options, resuming })
      .catch((e) => this.logger.error(`run ${run!.id} failed: ${e?.message}`))
      .finally(() => {
        this.running.delete(projectId);
      });
    return run;
  }

  async execute(runId: string, options: RunOptions): Promise<void> {
    // 心跳必须先于任何 await，防止看门狗把「刚启动尚未 findOne」判为孤儿
    this.runBeats.set(runId, Date.now());
    const runRepo = this.dataSource.getRepository(AgentRun);
    const run = await runRepo.findOne({ where: { id: runId } });
    if (!run) {
      this.runBeats.delete(runId);
      return;
    }
    const { tenantId, projectId } = run;
    // 从上次中断处继续：所有 DONE 步骤跳过；RUNNING 步骤作为当前步骤重跑
    const resuming = options.resuming ?? run.plan.some((s) => s.status === 'DONE');
    const ctx: ToolContext = {
      tenantId,
      projectId,
      runId,
      dataSource: this.dataSource,
      emit: (type, message, payload, stepId) => this.emit(run, type, message, payload, stepId),
    };

    this.emit(run, 'log', resuming ? '断点续跑：从上次未完成的位置继续' : 'Agent 开始执行，共 ' + run.plan.length + ' 个步骤');

    // 探活心跳：登记本进程正在执行的 run，每 15s 刷新内存时间戳。
    // execute 活着期间事件循环必然在转，心跳不会停；进程重启后 runBeats 随进程灭亡而自动消失，
    // watchdog 据此即可识别“孤儿”（runBeats 中不存在但 DB 为 RUNNING/PENDING）。
    this.runBeats.set(run.id, Date.now());
    const heartbeat = setInterval(() => {
      this.runBeats.set(run.id, Date.now());
      runRepo
        .update({ id: run.id }, { lastActivityAt: new Date() })
        .catch(() => undefined);
    }, 15_000);
    const stopHeartbeat = () => {
      clearInterval(heartbeat);
      this.runBeats.delete(run.id);
    };

    try {
      for (const step of run.plan) {
        if (step.status === 'DONE') continue;
        // 协作式终止：若被看门狗/人工外部标记 FAILED/CANCELLED，不再继续（僵尸循环自行退出，避免状态反复翻转）
        const dbState = await runRepo.findOne({ where: { id: run.id }, select: ['status'] });
        if (dbState && (dbState.status === 'FAILED' || dbState.status === 'CANCELLED')) {
          stopHeartbeat();
          this.emit(run, 'log', '运行已被外部终止（超时看门狗/取消，可能来自其它标签页），停止后续步骤');
          return;
        }
        run.currentStepId = step.id;
        run.lastActivityAt = new Date();
        // 执行前先把当前步骤 plan 状态落库为 RUNNING：write 阶段可能持续很久（逐章撰写+自评），
        // 若阶段进行中 DB 里仍为 PENDING，则 SSE 快照/刷新回放都无法点亮该步骤卡片。
        const planStep = run.plan.find((s) => s.id === step.id);
        if (planStep && planStep.status !== 'DONE' && planStep.status !== 'RUNNING') planStep.status = 'RUNNING';
        await runRepo.save(run);

        if (step.id === 'write') {
          await this.runWritingPhase(ctx, run, step, resuming);
        } else if (step.id === 'responses') {
          await this.runResponsesPhase(ctx, run, step, resuming);
        } else if (step.id === 'export') {
          await this.runStep(ctx, run, step, {
            annotateOnSource: options.annotateOnSource !== false,
          });
        } else {
          await this.runStep(ctx, run, step, {});
        }

        // 步骤完成即时落库 plan 状态（不覆盖 status），保证中断/刷新后的回放与断点续跑准确
        await runRepo.update(
          { id: run.id },
          { plan: run.plan, totalTokens: run.totalTokens, lastActivityAt: new Date() },
        );
        await this.applyStageAfterStep(projectId, step.id);

        if (step.humanCheckpoint && (await this.needsHumanConfirm(projectId, step.id))) {
          const skip = options.skipHumanCheckpoints ?? env.autoContinue;
          if (!skip) {
            run.status = 'WAITING_HUMAN';
            await runRepo.save(run);
            stopHeartbeat();
            this.emit(run, 'waiting_human', `步骤【${step.title}】等待人工确认后再次启动`, { stepId: step.id }, step.id);
            return;
          }
        }
      }
      run.status = 'SUCCEEDED';
      run.finishedAt = new Date();
      run.currentStepId = null;
      await runRepo.save(run);
      stopHeartbeat();
      this.emit(run, 'run_end', '执行完成', { status: 'SUCCEEDED' });
    } catch (e) {
      run.status = 'FAILED';
      run.error = e instanceof Error ? e.message : String(e);
      run.finishedAt = new Date();
      await runRepo.save(run);
      stopHeartbeat();
      this.emit(run, 'run_end', `执行失败：${run.error}`, { status: 'FAILED' });
    }
  }

  private async runStep(ctx: ToolContext, run: AgentRun, step: AgentPlanStep, input: unknown): Promise<unknown> {
    const stepRepo = this.dataSource.getRepository(AgentStep);
    const row = await stepRepo.save({
      id: nextId(),
      tenantId: run.tenantId,
      runId: run.id,
      stepId: step.id,
      tool: step.tool,
      title: step.title,
      status: 'RUNNING' as AgentStep['status'],
      input: input as Record<string, unknown>,
    });
    step.status = 'RUNNING';
    this.emit(run, 'step_start', `开始：${step.title}`, undefined, step.id);
    const started = Date.now();
    try {
      const result = await this.registry.get(step.tool).run(ctx, input as never);
      row.status = 'DONE';
      row.output = result.output as Record<string, unknown>;
      row.tokens = result.tokens ?? 0;
      row.durationMs = Date.now() - started;
      await stepRepo.save(row);
      run.totalTokens += row.tokens;
      step.status = 'DONE';
      this.emit(run, 'step_end', `完成：${step.title}（${row.durationMs}ms）`, result.output, step.id);
      return result.output;
    } catch (e) {
      row.status = 'FAILED';
      row.error = e instanceof Error ? e.message : String(e);
      row.durationMs = Date.now() - started;
      await stepRepo.save(row);
      step.status = 'FAILED';
      this.emit(run, 'step_end', `失败：${step.title} - ${row.error}`, undefined, step.id);
      throw e;
    }
  }

  private async runResponsesPhase(ctx: ToolContext, run: AgentRun, step: AgentPlanStep, resuming: boolean): Promise<void> {
    const reqRepo = this.dataSource.getRepository(Requirement);
    const respRepo = this.dataSource.getRepository(BidResponse);
    const requirements = await reqRepo.find({ where: { projectId: run.projectId }, order: { sortOrder: 'ASC' } });
    if (requirements.length === 0) throw new Error('尚无招标要点，请先执行要点提取');

    step.status = 'RUNNING';
    this.emit(run, 'step_start', `开始：${step.title}（${requirements.length} 条要点）`, undefined, step.id);
    const started = Date.now();
    let tokens = 0;
    const searchTool = this.registry.get<{ query: string; topK?: number }>('search_knowledge');
    try {
      for (const req of requirements) {
        const existing = await respRepo.findOne({ where: { requirementId: req.id } });
        // 断点续跑：已有应答（无论是否确认）都跳过，避免重复生成
        if (existing && (resuming || existing.confirmed)) {
          if (resuming) this.emit(run, 'log', `续跑跳过已应答要点：${req.content.slice(0, 30)}`, undefined, step.id);
          continue;
        }
        this.events.emitActivity(run.projectId, `检索素材（${req.content.slice(0, 30)}）…`);
        const search = await searchTool.run(ctx, { query: req.content, topK: 5 });
        const hits = (search.output as { hits: { id: string; type: string; title: string; content: string }[] }).hits;
        const kbText = hits.map((h) => `- ${h.content.slice(0, 150)}`).join('\n');
        this.events.emitActivity(run.projectId, `生成应答（${req.content.slice(0, 30)}）…`);
        const draft = await this.llm.chat(
          [
            { role: 'system', content: '你是投标应答专家。只输出一个 JSON 对象，不要 Markdown 代码块、不要前后说明。字段：conclusion 取值 FULLY_MET|PARTIALLY_MET|DEVIATION|NOT_MET；content 为应答正文。content 内换行必须写成 \\n，英文双引号必须写成 \\"，禁止在 JSON 字符串里直接敲回车。content 控制在 800 字以内，用纯中文短句，不要用 ** 加粗。' },
            { role: 'user', content: `要点：${req.content}\n类别：${req.category}\n\n可用素材：\n${kbText}\n\n请生成点对点应答 JSON。` },
          ],
          { task: 'draft_response', tenantId: run.tenantId },
        );
        tokens += draft.tokens;
        const parsed = parseDraftResponse(draft.content);
        if (!parsed.parsed) {
          this.logger.warn(
            `应答 JSON 解析失败，已按文本推断结论为 ${parsed.conclusion}（req=${req.id}，原始前 200 字: ${draft.content.slice(0, 200)}）`,
          );
        }
        const row = existing ?? respRepo.create({ id: nextId(), tenantId: run.tenantId, projectId: run.projectId, requirementId: req.id });
        row.conclusion = parsed.conclusion;
        row.content = parsed.content;
        row.sourceRefs = hits.slice(0, 3).map((h) => ({ type: h.type, id: h.id, title: h.title }));
        row.confirmed = false;
        await respRepo.save(row);
        this.emit(run, 'log', `已应答要点：${req.content.slice(0, 40)}`, undefined, step.id);
      }
      await this.recordSubStep(run, step, 'search_knowledge', `${requirements.length} 条要点应答`, { requirementCount: requirements.length }, { answered: requirements.length }, tokens, Date.now() - started);
      step.status = 'DONE';
      this.emit(run, 'step_end', `完成：${step.title}`, { answered: requirements.length }, step.id);
    } catch (e) {
      step.status = 'FAILED';
      this.emit(run, 'step_end', `失败：${step.title} - ${e instanceof Error ? e.message : e}`, undefined, step.id);
      throw e;
    }
  }

  /**
   * 清理误用「招标目录」生成的历史章节，并同步保留章的 outlineNo。
   * 投标写作清单以标题为准，避免 outlineNo 与招标 TOC 冲突导致续跑跳过错章。
   */
  private async syncBidSectionsToOutline(
    projectId: string,
    outline: { no: string; title: string }[],
  ): Promise<void> {
    const sectionRepo = this.dataSource.getRepository(BidSection);
    const keepTitles = new Set(outline.map((o) => o.title));
    const all = await sectionRepo.find({ where: { projectId } });
    const toRemove = all.filter((s) => !keepTitles.has(s.title));
    if (toRemove.length) {
      await sectionRepo.remove(toRemove);
      this.logger.log(`项目 ${projectId} 已清理 ${toRemove.length} 个非投标大纲章节`);
    }
    for (const node of outline) {
      const row = await sectionRepo.findOne({ where: { projectId, title: node.title } });
      if (row && row.outlineNo !== node.no) {
        row.outlineNo = node.no;
        await sectionRepo.save(row);
      }
    }
  }

  private async runWritingPhase(ctx: ToolContext, run: AgentRun, step: AgentPlanStep, resuming: boolean): Promise<void> {
    const docRepo = this.dataSource.getRepository(TenderDoc);
    const clauseRepo = this.dataSource.getRepository(Clause);
    const reqRepo = this.dataSource.getRepository(Requirement);
    const sectionRepo = this.dataSource.getRepository(BidSection);

    const requirements = await reqRepo.find({ where: { projectId: run.projectId }, order: { sortOrder: 'ASC' } });
    const doc = await docRepo.findOne({ where: { projectId: run.projectId }, order: { createdAt: 'DESC' } });
    const clauses = doc
      ? await clauseRepo.find({ where: { docId: doc.id } })
      : [];

    const reqAnchors = requirements.map((r) => ({
      id: r.id,
      category: r.category,
      content: r.content,
      sortOrder: r.sortOrder,
      clauseId: r.clauseId,
    }));
    const clauseAnchors = clauses.map((c) => ({
      id: c.id,
      sectionPath: c.sectionPath,
      clauseNo: c.clauseNo,
      content: c.content,
    }));

    this.events.emitActivity(run.projectId, '自主规划写作目标（写什么、锚定原文何处）…');
    const planned = await planWritingByLlm(this.llm, {
      tenantId: run.tenantId,
      outline: doc?.outline ?? [],
      clauses: clauseAnchors,
      requirements: reqAnchors,
    });
    const outline =
      planned.chapters.length > 0
        ? planned.chapters
        : buildOutlineFromTenderPositions({ requirements: reqAnchors, clauses: clauseAnchors });
    await this.syncBidSectionsToOutline(run.projectId, outline);

    const reason = `${planned.source === 'llm' ? '自主规划' : '回退规则'}${planned.candidateCount != null ? `（先枚举 ${planned.candidateCount} 处候选` : ''}${planned.rounds && planned.rounds > 1 ? `，决策第 ${planned.rounds} 轮纠偏` : planned.candidateCount != null ? '，再决策' : ''}${planned.candidateCount != null ? '）' : ''}：${planned.rationale}；共写 ${outline.length} 段：${outline.map((o) => o.path).join('；')}`;
    this.emit(
      run,
      'log',
      reason,
      {
        outline,
        mode: planned.source,
        rationale: planned.rationale,
        rounds: planned.rounds,
        candidateCount: planned.candidateCount,
      },
      step.id,
    );
    if (planned.tokens) {
      await this.recordSubStep(
        run,
        step,
        'write_section',
        `写作规划（枚举→决策 / ${planned.source}）`,
        { candidateCount: planned.candidateCount },
        { chapterCount: outline.length, rationale: planned.rationale, rounds: planned.rounds },
        planned.tokens,
        0,
      );
    }

    step.status = 'RUNNING';
    this.emit(run, 'step_start', `开始：${step.title}（${outline.length} 段对应应答）`, { outline }, step.id);

    try {
      for (const node of outline) {
        const started = Date.now();
        let tokens = 0;
        if (resuming) {
          const existingSection = await sectionRepo.findOne({ where: { projectId: run.projectId, title: node.title } });
          // 仅跳过「有实质正文」的章节；填写须知残留 / 过短不算已写
          if (existingSection?.content && !isFillInstructionOnly(existingSection.content) && existingSection.content.trim().length >= 80) {
            this.events.emitActivity(run.projectId, `续跑跳过已生成应答【${node.title}】`);
            await this.recordSubStep(run, step, 'write_section', `续跑跳过（已有内容）：${node.title}`, { outlineNo: node.no }, { sectionId: existingSection.id, score: existingSection.reviewScore ?? 0 }, 0, 0);
            continue;
          }
        }
        this.events.emitActivity(run.projectId, `撰写对应应答【${node.title}】…`);
        const chapterReqs = requirements.filter((r) => node.requirementIds.includes(r.id));
        const chapterReqTexts = [
          ...(node.context ? [node.context] : []),
          ...chapterReqs.map((r) => `[${r.category}]${r.content}`),
        ];
        const result = await this.writeSection.run(ctx, {
          outlineNo: node.no,
          title: node.title,
          categories: node.categories,
          requirementIds: node.requirementIds,
          tenderAnchor: node.path,
          context: node.context,
        });
        tokens += result.tokens ?? 0;
        const sectionId = (result.output as { sectionId: string }).sectionId;
        let section = await sectionRepo.findOne({ where: { id: sectionId } });
        if (!section) continue;

        if (isFillInstructionOnly(section.content ?? '')) {
          throw new Error(
            `章节「${node.title}」未写出实质应答（仍像填写须知/空文），写作阶段失败，请重试或检查模型`,
          );
        }

        let round = 0;
        this.events.emitActivity(run.projectId, `自评应答【${node.title}】…`);
        let review = await this.selfReview.review(node.title, section.content ?? '', chapterReqTexts, run.tenantId);
        tokens += review.tokens;
        await this.recordSubStep(run, step, 'self_review', `自评：${node.title}`, { round }, review, review.tokens, 0);
        while (review.score < 80 && round < 3) {
          round++;
          this.events.emitActivity(run.projectId, `按建议重写【${node.title}】（第 ${round} 轮）…`);
          const rewriteTokens = await this.rewriteWithSuggestions(ctx, section, review.suggestions.join('；'));
          tokens += rewriteTokens;
          const refreshed = await sectionRepo.findOne({ where: { id: sectionId } });
          if (!refreshed) break;
          section = refreshed;
          this.events.emitActivity(run.projectId, `再次自评【${node.title}】（第 ${round + 1} 轮）…`);
          review = await this.selfReview.review(node.title, section.content ?? '', chapterReqTexts, run.tenantId);
          tokens += review.tokens;
          await this.recordSubStep(run, step, 'self_review', `自评(第${round + 1}轮)：${node.title}`, { round }, review, review.tokens, 0);
        }
        section = await sectionRepo.findOne({ where: { id: sectionId } });
        if (section) {
          section.reviewScore = review.score;
          await sectionRepo.save(section);
        }
        await this.recordSubStep(run, step, 'write_section', `写作：${node.title}`, { outlineNo: node.no, rewriteRounds: round }, { sectionId, score: review.score }, tokens, Date.now() - started);
        this.emit(run, 'log', `应答【${node.title}】完成，自评分 ${review.score}`, undefined, step.id);
      }
      step.status = 'DONE';
      this.emit(run, 'step_end', `完成：${step.title}`, undefined, step.id);
    } catch (e) {
      step.status = 'FAILED';
      this.emit(run, 'step_end', `失败：${step.title} - ${e instanceof Error ? e.message : e}`, undefined, step.id);
      throw e;
    }
  }

  private async rewriteWithSuggestions(ctx: ToolContext, section: BidSection, suggestions: string): Promise<number> {
    const { text, tokens } = await this.writeSection.rewrite(ctx, section, `根据自评建议改进：${suggestions}`);
    const repo = this.dataSource.getRepository(BidSection);
    section.content = text;
    section.genVersion += 1;
    await repo.save(section);
    return tokens;
  }

  private async recordSubStep(
    run: AgentRun,
    planStep: AgentPlanStep,
    tool: AgentStep['tool'],
    title: string,
    input: unknown,
    output: unknown,
    tokens: number,
    durationMs: number,
  ): Promise<void> {
    await this.dataSource.getRepository(AgentStep).save({
      id: nextId(),
      tenantId: run.tenantId,
      runId: run.id,
      stepId: planStep.id,
      tool,
      title,
      status: 'DONE',
      input: input as Record<string, unknown>,
      output: output as Record<string, unknown>,
      tokens,
      durationMs,
    });
    run.totalTokens += tokens;
  }

  private async needsHumanConfirm(projectId: string, stepId: string): Promise<boolean> {
    if (stepId === 'requirements') {
      const total = await this.dataSource.getRepository(Requirement).count({ where: { projectId } });
      const confirmed = await this.dataSource.getRepository(Requirement).count({ where: { projectId, confirmed: true } });
      return total === 0 || confirmed < total;
    }
    if (stepId === 'responses') {
      const total = await this.dataSource.getRepository(BidResponse).count({ where: { projectId } });
      const confirmed = await this.dataSource.getRepository(BidResponse).count({ where: { projectId, confirmed: true } });
      return total === 0 || confirmed < total;
    }
    return false;
  }

  private async applyStageAfterStep(projectId: string, stepId: string): Promise<void> {
    const map: Partial<Record<string, ProjectStage>> = {
      parse: 'PARSED',
      requirements: 'REQUIREMENTS_CONFIRMED',
      responses: 'RESPONSES_CONFIRMED',
      write: 'WRITING',
      compliance: 'REVIEW',
      export: 'FINALIZED',
    };
    const stage = map[stepId];
    if (stage === 'WRITING') {
      await this.dataSource.getRepository(Project).update({ id: projectId }, { stage: 'WRITING' });
      return;
    }
    if (stage) {
      await this.dataSource.getRepository(Project).update({ id: projectId }, { stage });
    }
  }

  async rewriteSection(tenantId: string, sectionId: string, instruction: string): Promise<BidSection> {
    const repo = this.dataSource.getRepository(BidSection);
    const section = await repo.findOne({ where: { id: sectionId, tenantId } });
    if (!section) throw new NotFoundException('章节不存在');
    const ctx: ToolContext = {
      tenantId,
      projectId: section.projectId,
      runId: 'manual',
      dataSource: this.dataSource,
      emit: () => undefined,
    };
    const { text } = await this.writeSection.rewrite(ctx, section, instruction);
    section.content = text;
    section.genVersion += 1;
    section.status = 'GENERATED';
    return repo.save(section);
  }

  async exportNow(
    tenantId: string,
    projectId: string,
    opts?: { annotateOnSource?: boolean },
  ): Promise<{ fileUri: string }> {
    const ctx: ToolContext = {
      tenantId,
      projectId,
      runId: 'manual',
      dataSource: this.dataSource,
      emit: () => undefined,
    };
    const result = await this.registry.get('export_docx').run(ctx, {
      annotateOnSource: opts?.annotateOnSource !== false,
    } as never);
    return result.output as { fileUri: string };
  }

  async parseNow(tenantId: string, projectId: string): Promise<unknown> {
    const ctx: ToolContext = {
      tenantId,
      projectId,
      runId: 'manual',
      dataSource: this.dataSource,
      emit: () => undefined,
    };
    const result = await this.registry.get('parse_document').run(ctx, undefined as never);
    return result.output;
  }

  private emit(run: AgentRun, type: AgentProgressEvent['type'], message: string, payload?: unknown, stepId?: string): void {
    this.events.emitProgress({
      runId: run.id,
      projectId: run.projectId,
      type,
      stepId,
      message,
      payload,
      at: new Date().toISOString(),
    });
    // 每条事件都视作「活动」，异步更新 lastActivityAt，watchdog 据此判断是否假死
    this.dataSource
      .getRepository(AgentRun)
      .update({ id: run.id }, { lastActivityAt: new Date() })
      .catch(() => undefined);
  }

  /** 应用启动后：热恢复残留 RUNNING，再开启探活监控 */
  onApplicationBootstrap(): void {
    if (this.watchdogTimer) return;
    this.bootedAt = Date.now();
    void this.resumeOrphanRunsAfterBoot().catch((err) =>
      this.logger.warn(`启动热恢复失败: ${err instanceof Error ? err.message : err}`),
    );
    this.watchdogTimer = setInterval(() => {
      void this.sweepStaleRuns().catch((err) => this.logger.warn('watchdog 扫描失败', err));
    }, this.watchdogMs);
    this.logger.log('Agent watchdog 已启动（探活式：进程内心跳 45s 未刷新判卡死；启动时优先热恢复孤儿）');
  }

  /**
   * 进程重启（dev 热重载 / 崩溃）后，DB 中仍为 RUNNING/PENDING 的任务在本进程无 execute。
   * 优先自动续跑，而不是等看门狗标 FAILED 让用户误以为「一点就挂」。
   */
  private async resumeOrphanRunsAfterBoot(): Promise<void> {
    const repo = this.dataSource.getRepository(AgentRun);
    const orphans = await repo
      .createQueryBuilder('r')
      .where(`r.status IN ('PENDING','RUNNING')`)
      .orderBy('r.last_activity_at', 'DESC')
      .getMany();
    for (const run of orphans) {
      if (this.running.has(run.projectId) || this.runBeats.has(run.id)) continue;
      this.logger.log(`启动热恢复：续跑残留任务 ${run.id}（项目 ${run.projectId}）`);
      run.error = null;
      run.finishedAt = null;
      run.lastActivityAt = new Date();
      // 将 FAILED 步骤拨回 RUNNING，便于阶段内重试；DONE 保持不变
      for (const s of run.plan ?? []) if (s.status === 'FAILED') s.status = 'RUNNING';
      await repo.save(run);
      this.running.add(run.projectId);
      this.runBeats.set(run.id, Date.now());
      void this.execute(run.id, { resuming: true })
        .catch((e) => this.logger.error(`热恢复 run ${run.id} 失败: ${e?.message}`))
        .finally(() => this.running.delete(run.projectId));
    }
  }

  private async sweepStaleRuns(): Promise<void> {
    const repo = this.dataSource.getRepository(AgentRun);
    // 仅扫描 PENDING / RUNNING：WAITING_HUMAN 是合法暂停（等待人工），不视为僵尸
    const candidates = await repo
      .createQueryBuilder('r')
      .where(`r.status IN ('PENDING','RUNNING')`)
      .limit(50)
      .getMany();
    const now = Date.now();
    // 启动宽限：给热恢复 / startRun 登记心跳的时间，避免首轮扫描误杀
    const inBootGrace = now - this.bootedAt < this.watchdogMs + 5_000;
    for (const run of candidates) {
      const beat = this.runBeats.get(run.id);
      // 情况 1：本进程正在执行且心跳新鲜 → 活着的运行，跳过
      if (beat !== undefined && now - beat < this.beatStaleMs) continue;

      // 情况 3：本进程中没有该 run 的任何记录
      if (beat === undefined) {
        if (inBootGrace || this.running.has(run.projectId)) {
          continue;
        }
        this.logger.warn(`回收孤儿运行 ${run.id}（无存活执行实例，DB status=${run.status}），标记为 FAILED`);
        run.status = 'FAILED';
        run.error = '运行已无存活执行（进程重启或异常退出），可重新启动以断点续跑';
        run.finishedAt = new Date();
        run.lastActivityAt = new Date();
        // 当前步骤标 FAILED，便于 UI 与续跑定位
        const cur = run.plan?.find((s) => s.id === run.currentStepId || s.status === 'RUNNING');
        if (cur && cur.status !== 'DONE') cur.status = 'FAILED';
        await repo.save(run);
        this.events.emitProgress({
          runId: run.id,
          projectId: run.projectId,
          type: 'run_end',
          message: run.error,
          payload: { status: 'FAILED', stale: true, reclaimed: true },
          at: new Date().toISOString(),
        });
        continue;
      }

      // 情况 2：有执行实例但心跳过期（>45s）→ 事件循环卡死，真僵
      const stuckSec = Math.floor((now - beat!) / 1000);
      this.logger.warn(`发现僵死运行 ${run.id}，事件循环心跳已停 ${stuckSec}s，标记为 FAILED`);
      run.status = 'FAILED';
      run.error = `执行实例事件循环卡死（心跳停滞 ${stuckSec} 秒），已自动终止`;
      run.finishedAt = new Date();
      run.lastActivityAt = new Date();
      const cur = run.plan?.find((s) => s.id === run.currentStepId || s.status === 'RUNNING');
      if (cur && cur.status !== 'DONE') cur.status = 'FAILED';
      await repo.save(run);
      this.runBeats.delete(run.id);
      this.events.emitProgress({
        runId: run.id,
        projectId: run.projectId,
        type: 'run_end',
        message: run.error,
        payload: { status: 'FAILED', stale: true, idleSec: stuckSec },
        at: new Date().toISOString(),
      });
    }
  }

  onModuleDestroy(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}
