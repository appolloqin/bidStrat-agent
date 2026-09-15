import { Body, Controller, Delete, Get, MessageEvent, Param, Patch, Post, Res, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as fs from 'fs';
import type { Response } from 'express';
import { ProjectsService } from './projects.service';
import { AgentEventsService } from '../agent/agent-events.service';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { BackfillResultDto, CreateProjectDto, ExportProjectDto, RunProjectDto, UpdateProjectDto } from './dto/project.dto';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly events: AgentEventsService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.get(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.remove(user, id);
  }

  @Post(':id/run')
  run(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RunProjectDto) {
    return this.projects.run(user, id, dto);
  }

  @Post(':id/export')
  export(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExportProjectDto) {
    return this.projects.export(user, id, dto);
  }

  @Get(':id/export/download')
  async downloadExport(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const { abs, fileName } = await this.projects.getExportFile(user, id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bid-document.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    fs.createReadStream(abs).pipe(res);
  }

  @Post(':id/result')
  backfill(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BackfillResultDto) {
    return this.projects.backfillResult(user, id, dto);
  }

  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.close(user, id);
  }

  @Sse(':id/events')
  async streamEvents(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Observable<MessageEvent>> {
    await this.projects.get(user, id);
    return this.events.subscribe(id);
  }
}
