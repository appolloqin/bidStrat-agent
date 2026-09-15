import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KBAsset, KBChunk, Memory } from '../entities';
import { KBController } from './kb.controller';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [TypeOrmModule.forFeature([KBAsset, KBChunk, Memory])],
  controllers: [KBController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KBModule {}
