import { Module } from '@nestjs/common';
import { KBModule } from '../kb/kb.module';
import { AgentEventsService } from './agent-events.service';
import { AgentService } from './agent.service';
import { AgentRunsController } from './agent-runs.controller';
import { ToolRegistry } from './tool.registry';
import { ParseDocumentTool } from './tools/parse-document.tool';
import { ExtractRequirementsTool } from './tools/extract-requirements.tool';
import { SearchKnowledgeTool } from './tools/search-knowledge.tool';
import { WriteSectionTool } from './tools/write-section.tool';
import { SelfReviewTool } from './tools/self-review.tool';
import { ComplianceCheckTool } from './tools/compliance-check.tool';
import { ExportDocxTool } from './tools/export-docx.tool';

@Module({
  imports: [KBModule],
  controllers: [AgentRunsController],
  providers: [
    AgentService,
    AgentEventsService,
    ToolRegistry,
    ParseDocumentTool,
    ExtractRequirementsTool,
    SearchKnowledgeTool,
    WriteSectionTool,
    SelfReviewTool,
    ComplianceCheckTool,
    ExportDocxTool,
  ],
  exports: [AgentService, AgentEventsService],
})
export class AgentModule {}
