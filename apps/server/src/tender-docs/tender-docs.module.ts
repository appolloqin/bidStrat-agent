import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project, TenderDoc } from '../entities';
import { AuditModule } from '../audit/audit.module';
import { TenderDocsController } from './tender-docs.controller';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [TypeOrmModule.forFeature([Project, TenderDoc]), AuditModule, AgentModule],
  controllers: [TenderDocsController],
})
export class TenderDocsModule {}