import { Body, Controller, Get, NotFoundException, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Project, TenderDoc } from '../entities';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AgentService } from '../agent/agent.service';
import { diskStorage } from 'multer';
import * as path from 'path';
import { env } from '../config/env';
import { nextId } from '../common/snowflake';
import { extname } from 'path';

@Controller('tender-docs')
export class TenderDocsController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly agent: AgentService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('projectId') projectId?: string) {
    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (projectId) where.projectId = projectId;
    return this.dataSource
      .getRepository(TenderDoc)
      .find({ where, order: { createdAt: 'DESC' }, take: 100 });
  }

  @Get(':id')
  async getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const d = await this.dataSource
      .getRepository(TenderDoc)
      .findOne({ where: { id, tenantId: user.tenantId } });
    if (!d) throw new NotFoundException('招标文件不存在');
    return d;
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: env.uploadDir,
        filename: (_req, file, cb) => {
          const safe = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[\\/:*?"<>|]/g, '_');
          cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${extname(safe) || path.extname(file.originalname) || ''}`);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { projectId: string },
  ) {
    if (!file) throw new NotFoundException('未收到文件');
    if (!body.projectId) throw new NotFoundException('缺少 projectId');
    const project = await this.dataSource
      .getRepository(Project)
      .findOne({ where: { id: body.projectId, tenantId: user.tenantId } });
    if (!project) throw new NotFoundException('项目不存在');
    const repo = this.dataSource.getRepository(TenderDoc);
    const doc = repo.create({
      id: nextId(),
      tenantId: user.tenantId,
      projectId: body.projectId,
      fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      fileUri: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
      mimeType: file.mimetype,
      parseStatus: 'PENDING',
      uploadedBy: user.sub,
    });
    await repo.save(doc);
    await this.audit.log(user.tenantId, user, 'tender.upload', 'tender_doc', doc.id, {
      projectId: body.projectId,
      fileName: doc.fileName,
    });
    setImmediate(() => this.runParse(doc.id, user.tenantId));
    return doc;
  }

  @Post(':id/reparse')
  async reparse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const doc = await this.dataSource
      .getRepository(TenderDoc)
      .findOne({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('招标文件不存在');
    await this.audit.log(user.tenantId, user, 'tender.reparse', 'tender_doc', id);
    await this.runParse(id, user.tenantId);
    return this.dataSource.getRepository(TenderDoc).findOne({ where: { id } });
  }

  private async runParse(docId: string, tenantId: string): Promise<void> {
    const repo = this.dataSource.getRepository(TenderDoc);
    const projectRepo = this.dataSource.getRepository(Project);
    const doc = await repo.findOne({ where: { id: docId } });
    if (!doc) return;
    try {
      doc.parseStatus = 'PARSING';
      await repo.save(doc);
      const out = (await this.agent.parseNow(tenantId, doc.projectId)) as { outline?: unknown; docId?: string };
      if (out?.outline) doc.outline = out.outline as never;
      doc.parseStatus = 'PARSED';
      await repo.save(doc);
      const project = await projectRepo.findOne({ where: { id: doc.projectId } });
      if (project) {
        project.stage = 'PARSED';
        await projectRepo.save(project);
      }
    } catch {
      doc.parseStatus = 'FAILED';
      await repo.save(doc);
    }
  }
}
