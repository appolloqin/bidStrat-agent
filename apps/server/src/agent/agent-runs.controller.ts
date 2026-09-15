import { Controller, Get, Param } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AgentRun, AgentStep } from '../entities';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { NotFoundException } from '@nestjs/common';

@Controller('agent-runs')
export class AgentRunsController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.dataSource
      .getRepository(AgentRun)
      .find({ where: { tenantId: user.tenantId }, order: { createdAt: 'DESC' }, take: 50 });
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const run = await this.dataSource.getRepository(AgentRun).findOne({ where: { id, tenantId: user.tenantId } });
    if (!run) throw new NotFoundException('执行记录不存在');
    const steps = await this.dataSource
      .getRepository(AgentStep)
      .find({ where: { runId: id }, order: { createdAt: 'ASC' } });
    return { ...run, steps };
  }
}
