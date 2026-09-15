import { Body, Controller, Get, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EvalCase, EvalReport } from '../entities';
import { nextId } from '../common/snowflake';
import { EvalService } from './eval.service';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateEvalCaseDto, RunEvalDto } from './dto/eval.dto';

@Controller('eval')
export class EvalController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly evalService: EvalService,
  ) {}

  @Get('cases')
  listCases(@CurrentUser() user: AuthUser) {
    return this.dataSource.getRepository(EvalCase).find({ where: { tenantId: user.tenantId } });
  }

  @Post('cases')
  createCase(@CurrentUser() user: AuthUser, @Body() dto: CreateEvalCaseDto) {
    return this.dataSource.getRepository(EvalCase).save({
      id: nextId(),
      tenantId: user.tenantId,
      name: dto.name,
      input: dto.input,
      expected: dto.expected ?? null,
      status: 'ACTIVE',
    });
  }

  @Get('reports')
  listReports(@CurrentUser() user: AuthUser) {
    return this.dataSource
      .getRepository(EvalReport)
      .find({ where: { tenantId: user.tenantId }, order: { createdAt: 'DESC' }, take: 50 });
  }

  @Post('run')
  run(@CurrentUser() user: AuthUser, @Body() dto: RunEvalDto) {
    return this.evalService.runRegression(user.tenantId, dto.name ?? '手动回归', dto.cardId);
  }
}
