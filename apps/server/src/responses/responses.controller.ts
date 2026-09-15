import { Body, Controller, Get, NotFoundException, Param, Put, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { BidResponse, Project } from '../entities';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { UpdateResponseDto } from './dto/response.dto';
import { AuditService } from '../audit/audit.service';

@Controller('responses')
export class ResponsesController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('projectId') projectId: string) {
    if (!projectId) throw new NotFoundException('缺少 projectId');
    const project = await this.dataSource
      .getRepository(Project)
      .findOne({ where: { id: projectId, tenantId: user.tenantId } });
    if (!project) throw new NotFoundException('项目不存在');
    return this.dataSource
      .getRepository(BidResponse)
      .find({ where: { tenantId: user.tenantId, projectId }, order: { createdAt: 'ASC' } });
  }

  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateResponseDto) {
    const repo = this.dataSource.getRepository(BidResponse);
    const r = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!r) throw new NotFoundException('应答不存在');
    if (dto.conclusion) r.conclusion = dto.conclusion;
    if (dto.content !== undefined) r.content = dto.content;
    if (dto.confirmed !== undefined) r.confirmed = dto.confirmed;
    await repo.save(r);
    await this.audit.log(user.tenantId, user, 'response.update', 'response', id, dto as Record<string, unknown>);
    return r;
  }

  @Put('batch/confirm')
  async batchConfirm(
    @CurrentUser() user: AuthUser,
    @Body() body: { projectId: string; ids: string[]; confirmed: boolean },
  ) {
    const repo = this.dataSource.getRepository(BidResponse);
    const rows = await repo.findBy({ tenantId: user.tenantId, projectId: body.projectId, id: In(body.ids) });
    rows.forEach((r) => (r.confirmed = body.confirmed));
    await repo.save(rows);
    await this.audit.log(user.tenantId, user, 'response.batch', 'response', body.projectId, {
      ids: body.ids,
      confirmed: body.confirmed,
    } as Record<string, unknown>);
    return { updated: rows.length };
  }
}