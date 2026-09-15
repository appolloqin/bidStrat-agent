import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExperienceCard } from '../entities';
import { nextId } from '../common/snowflake';
import { EvolutionService } from './evolution.service';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateCardDto } from './dto/card.dto';

@Controller('experience-cards')
export class ExperienceCardsController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly evolution: EvolutionService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('gateStatus') gateStatus?: string) {
    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (gateStatus) where.gateStatus = gateStatus;
    return this.dataSource
      .getRepository(ExperienceCard)
      .find({ where, order: { createdAt: 'DESC' }, take: 100 });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCardDto) {
    return this.dataSource.getRepository(ExperienceCard).save({
      id: nextId(),
      tenantId: user.tenantId,
      projectId: dto.projectId ?? null,
      scenario: dto.scenario,
      before: dto.before ?? null,
      after: dto.after ?? null,
      rule: dto.rule,
      target: dto.target,
      evidence: dto.evidence ?? null,
      confidence: dto.confidence ?? 0.5,
      gateStatus: 'PENDING',
    });
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.evolution.approve(user.tenantId, id, user);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.evolution.reject(user.tenantId, id, user);
  }
}
