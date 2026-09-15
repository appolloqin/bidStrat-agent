import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BidResponse, BidSection, EditFeedback, Project, Requirement } from '../entities';
import { AuditModule } from '../audit/audit.module';
import { SectionsController } from './sections.controller';
import { AgentModule } from '../agent/agent.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BidResponse, BidSection, EditFeedback, Project, Requirement]),
    AuditModule,
    AgentModule,
    LlmModule,
  ],
  controllers: [SectionsController],
})
export class SectionsModule {}