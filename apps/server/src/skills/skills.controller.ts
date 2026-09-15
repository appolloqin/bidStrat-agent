import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Skill } from '../entities';
import { nextId } from '../common/snowflake';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { UpsertSkillDto } from './dto/skill.dto';
import { AuditService } from '../audit/audit.service';

@Controller('skills')
export class SkillsController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.dataSource
      .getRepository(Skill)
      .find({ where: { tenantId: user.tenantId }, order: { updatedAt: 'DESC' }, take: 200 });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: UpsertSkillDto) {
    const repo = this.dataSource.getRepository(Skill);
    const row = repo.create({
      id: nextId(),
      tenantId: user.tenantId,
      name: dto.name,
      trigger: dto.trigger ?? null,
      promptTpl: dto.promptTpl,
      tools: dto.tools ?? [],
      version: 1,
      status: 'ACTIVE',
      approvedBy: user.sub,
      approvedAt: new Date(),
    } as Skill);
    await repo.save(row);
    await this.audit.log(user.tenantId, user, 'skill.create', 'skill', row.id);
    return row;
  }

  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertSkillDto) {
    const repo = this.dataSource.getRepository(Skill);
    const old = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!old) throw new NotFoundException('技能不存在');
    old.status = 'DISABLED';
    await repo.save(old);
    const fresh = repo.create({
      id: nextId(),
      tenantId: user.tenantId,
      name: dto.name ?? old.name,
      trigger: dto.trigger ?? old.trigger,
      promptTpl: dto.promptTpl,
      tools: dto.tools ?? old.tools,
      version: old.version + 1,
      status: 'ACTIVE',
      approvedBy: user.sub,
      approvedAt: new Date(),
      parentId: old.id,
    } as Skill);
    await repo.save(fresh);
    await this.audit.log(user.tenantId, user, 'skill.update', 'skill', fresh.id, { prevId: old.id });
    return fresh;
  }

  @Post(':id/rollback')
  async rollback(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const repo = this.dataSource.getRepository(Skill);
    const cur = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!cur) throw new NotFoundException('技能不存在');
    const parentId = cur.parentId;
    if (!parentId) throw new NotFoundException('没有可回滚的版本');
    cur.status = 'DISABLED';
    await repo.save(cur);
    const prev = await repo.findOne({ where: { id: parentId } });
    if (prev) {
      prev.status = 'ACTIVE';
      await repo.save(prev);
    }
    await this.audit.log(user.tenantId, user, 'skill.rollback', 'skill', id, { rolledBackTo: parentId });
    return prev ?? cur;
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const repo = this.dataSource.getRepository(Skill);
    const s = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException('技能不存在');
    s.status = 'DISABLED';
    await repo.save(s);
    await this.audit.log(user.tenantId, user, 'skill.disable', 'skill', id);
    return { deleted: true };
  }
}