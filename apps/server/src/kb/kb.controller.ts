import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KBAsset, KBChunk } from '../entities';
import { nextId } from '../common/snowflake';
import { hashEmbed } from '../common/vector';
import { KnowledgeService } from './knowledge.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateKbAssetDto, SearchKbDto, UpdateKbAssetDto } from './dto/kb.dto';

@Controller('kb')
export class KBController {
  constructor(
    @InjectRepository(KBAsset)
    private readonly assetRepo: Repository<KBAsset>,
    @InjectRepository(KBChunk)
    private readonly chunkRepo: Repository<KBChunk>,
    private readonly knowledge: KnowledgeService,
    private readonly audit: AuditService,
  ) {}

  @Get('assets')
  listAssets(@CurrentUser() user: AuthUser) {
    return this.assetRepo.find({ where: { tenantId: user.tenantId }, order: { createdAt: 'DESC' } });
  }

  @Post('assets')
  async createAsset(@CurrentUser() user: AuthUser, @Body() dto: CreateKbAssetDto) {
    const asset = await this.assetRepo.save({
      id: nextId(),
      tenantId: user.tenantId,
      assetType: dto.assetType,
      title: dto.title,
      content: dto.content,
      meta: dto.meta ?? null,
      status: 'ACTIVE',
    });
    const chunks = this.knowledge.splitChunks(dto.content);
    await this.chunkRepo.save(
      chunks.map((c, i) => ({
        id: nextId(),
        tenantId: user.tenantId,
        assetId: asset.id,
        chunkNo: i,
        content: c,
        embedding: hashEmbed(c),
      })),
    );
    await this.audit.log(user.tenantId, user, 'kb.asset.create', 'kb_asset', asset.id, { title: dto.title });
    return asset;
  }

  @Get('assets/:id')
  async getAsset(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const asset = await this.assetRepo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!asset) throw new NotFoundException('知识库资产不存在');
    const chunks = await this.chunkRepo.find({ where: { assetId: id }, order: { chunkNo: 'ASC' } });
    return { ...asset, chunks };
  }

  @Put('assets/:id')
  async updateAsset(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateKbAssetDto) {
    const asset = await this.assetRepo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!asset) throw new NotFoundException('知识库资产不存在');
    Object.assign(asset, dto);
    await this.assetRepo.save(asset);
    if (dto.content) {
      await this.chunkRepo.delete({ assetId: id });
      const chunks = this.knowledge.splitChunks(dto.content);
      await this.chunkRepo.save(
        chunks.map((c, i) => ({ id: nextId(), tenantId: user.tenantId, assetId: id, chunkNo: i, content: c, embedding: hashEmbed(c) })),
      );
    }
    await this.audit.log(user.tenantId, user, 'kb.asset.update', 'kb_asset', id);
    return asset;
  }

  @Delete('assets/:id')
  async deleteAsset(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const asset = await this.assetRepo.findOne({ where: { id, tenantId: user.tenantId } });
    if (!asset) throw new NotFoundException('知识库资产不存在');
    await this.chunkRepo.delete({ assetId: id });
    await this.assetRepo.delete({ id });
    await this.audit.log(user.tenantId, user, 'kb.asset.delete', 'kb_asset', id);
    return { deleted: true };
  }

  @Post('search')
  search(@CurrentUser() user: AuthUser, @Body() dto: SearchKbDto) {
    return this.knowledge.search(user.tenantId, dto.query, dto.topK ?? 8);
  }
}
