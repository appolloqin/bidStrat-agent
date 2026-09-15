import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Project } from '../entities';
import { nextId } from '../common/snowflake';
import { AgentService } from '../agent/agent.service';
import { AuditService } from '../audit/audit.service';
import { EvolutionService } from '../evolution/evolution.service';
import { AuthUser } from '../common/current-user.decorator';
import { BackfillResultDto, CreateProjectDto, ExportProjectDto, RunProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly agent: AgentService,
    private readonly evolution: EvolutionService,
    private readonly audit: AuditService,
  ) {}

  private get repo() {
    return this.dataSource.getRepository(Project);
  }

  async create(user: AuthUser, dto: CreateProjectDto): Promise<Project> {
    const project = await this.repo.save({
      id: nextId(),
      tenantId: user.tenantId,
      tenderName: dto.tenderName,
      tenderNo: dto.tenderNo ?? null,
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      remark: dto.remark ?? null,
      stage: 'CREATED',
      status: 'ACTIVE',
      createdBy: user.sub,
    });
    await this.audit.log(user.tenantId, user, 'project.create', 'project', project.id, { tenderName: dto.tenderName });
    return project;
  }

  list(user: AuthUser): Promise<Project[]> {
    return this.repo.find({ where: { tenantId: user.tenantId }, order: { createdAt: 'DESC' } });
  }

  async get(user: AuthUser, id: string): Promise<Project> {
    const project = await this.repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!project) throw new NotFoundException('项目不存在');
    return project;
  }

  async update(user: AuthUser, id: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.get(user, id);
    if (dto.tenderName !== undefined) project.tenderName = dto.tenderName;
    if (dto.tenderNo !== undefined) project.tenderNo = dto.tenderNo;
    if (dto.deadline !== undefined) project.deadline = new Date(dto.deadline);
    if (dto.remark !== undefined) project.remark = dto.remark;
    return this.repo.save(project);
  }

  async remove(user: AuthUser, id: string): Promise<{ deleted: boolean }> {
    const project = await this.get(user, id);
    project.status = 'ARCHIVED';
    await this.repo.save(project);
    await this.audit.log(user.tenantId, user, 'project.archive', 'project', id);
    return { deleted: true };
  }

  async run(user: AuthUser, id: string, dto: RunProjectDto) {
    await this.get(user, id);
    const run = await this.agent.startRun(id, user.tenantId, {
      skipHumanCheckpoints: dto.skipHumanCheckpoints,
      annotateOnSource: dto.annotateOnSource !== false,
    });
    await this.audit.log(user.tenantId, user, 'project.run', 'project', id, { runId: run.id });
    return { runId: run.id, status: run.status };
  }

  async export(user: AuthUser, id: string, dto: ExportProjectDto = {}) {
    await this.get(user, id);
    const result = await this.agent.exportNow(user.tenantId, id, {
      annotateOnSource: dto.annotateOnSource !== false,
    });
    await this.audit.log(user.tenantId, user, 'project.export', 'project', id, result);
    return result;
  }

  async getExportFile(user: AuthUser, id: string): Promise<{ abs: string; fileName: string }> {
    const project = await this.get(user, id);
    if (!project.exportFileUri) {
      throw new NotFoundException('该项目尚未导出，请先点击「导出 Word」');
    }
    const rel = project.exportFileUri.replace(/^\/+/, '');
    const abs = path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel);
    if (!fs.existsSync(abs)) {
      throw new NotFoundException('导出文件不存在或已被清理，请重新导出');
    }
    const safeName = (project.tenderName || '投标文件').replace(/[\\/:*?"<>|]/g, '_');
    return { abs, fileName: `${safeName}-投标文件.docx` };
  }

  async backfillResult(user: AuthUser, id: string, dto: BackfillResultDto) {
    const project = await this.get(user, id);
    project.won = dto.won;
    project.resultNote = dto.note ?? null;
    await this.repo.save(project);
    await this.audit.log(user.tenantId, user, 'project.result', 'project', id, { won: dto.won });
    return project;
  }

  async close(user: AuthUser, id: string) {
    const project = await this.get(user, id);
    project.status = 'DONE';
    project.stage = 'CLOSED';
    project.closedAt = new Date();
    await this.repo.save(project);
    const cards = await this.evolution.reviewProject(user.tenantId, id, user.sub);
    await this.audit.log(user.tenantId, user, 'project.close', 'project', id, { experienceCards: cards.length });
    return { project, experienceCards: cards };
  }
}
