import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Memory } from '../entities';
import { nextId } from '../common/snowflake';
import { hashEmbed } from '../common/vector';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { UpsertMemoryDto } from './dto/memory.dto';
import { AuditService } from '../audit/audit.service';

@Controller('memories')
export class MemoriesController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.dataSource
      .getRepository(Memory)
      .find({ where: { tenantId: user.tenantId }, order: { updatedAt: 'DESC' }, take: 200 });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: UpsertMemoryDto) {
    const repo = this.dataSource.getRepository(Memory);
    const row = repo.create({
      id: nextId(),
      tenantId: user.tenantId,
      memType: dto.memType,
      content: dto.content,
      tags: dto.tags ?? [],
      confidence: dto.confidence ?? 0.7,
      status: 'ACTIVE',
      version: 1,
      embedding: hashEmbed(dto.content),
    });
    await repo.save(row);
    await this.audit.log(user.tenantId, user, 'memory.create', 'memory', row.id);
    return row;
  }

  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertMemoryDto) {
    const repo = this.dataSource.getRepository(Memory);
    const old = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!old) throw new NotFoundException('记忆不存在');
    old.status = 'DISABLED';
    await repo.save(old);
    const fresh = repo.create({
      id: nextId(),
      tenantId: user.tenantId,
      memType: dto.memType,
      content: dto.content,
      tags: dto.tags ?? old.tags,
      confidence: dto.confidence ?? old.confidence,
      status: 'ACTIVE',
      version: old.version + 1,
      embedding: hashEmbed(dto.content),
      parentId: old.id,
    });
    await repo.save(fresh);
    await this.audit.log(user.tenantId, user, 'memory.update', 'memory', fresh.id, { prevId: old.id });
    return fresh;
  }

  @Post(':id/disable')
  async disable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const repo = this.dataSource.getRepository(Memory);
    const m = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!m) throw new NotFoundException('记忆不存在');
    m.status = 'DISABLED';
    await repo.save(m);
    await this.audit.log(user.tenantId, user, 'memory.disable', 'memory', id);
    return m;
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const repo = this.dataSource.getRepository(Memory);
    const m = await repo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!m) throw new NotFoundException('记忆不存在');
    m.status = 'DISABLED';
    await repo.save(m);
    await this.audit.log(user.tenantId, user, 'memory.delete', 'memory', id);
    return { deleted: true };
  }
}