import { Injectable } from '@nestjs/common';
import { ToolName } from '@bidstrat/shared';
import { AgentTool } from './tools/tool.interface';
import { ParseDocumentTool } from './tools/parse-document.tool';
import { ExtractRequirementsTool } from './tools/extract-requirements.tool';
import { SearchKnowledgeTool } from './tools/search-knowledge.tool';
import { WriteSectionTool } from './tools/write-section.tool';
import { SelfReviewTool } from './tools/self-review.tool';
import { ComplianceCheckTool } from './tools/compliance-check.tool';
import { ExportDocxTool } from './tools/export-docx.tool';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<ToolName, AgentTool<never>>();

  constructor(
    parseDocument: ParseDocumentTool,
    extractRequirements: ExtractRequirementsTool,
    searchKnowledge: SearchKnowledgeTool,
    writeSection: WriteSectionTool,
    selfReview: SelfReviewTool,
    complianceCheck: ComplianceCheckTool,
    exportDocx: ExportDocxTool,
  ) {
    const all: AgentTool<never>[] = [
      parseDocument as AgentTool<never>,
      extractRequirements as AgentTool<never>,
      searchKnowledge as AgentTool<never>,
      writeSection as AgentTool<never>,
      selfReview as AgentTool<never>,
      complianceCheck as AgentTool<never>,
      exportDocx as AgentTool<never>,
    ];
    for (const t of all) this.tools.set(t.name, t);
  }

  get<T = unknown>(name: ToolName): AgentTool<T> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`工具未注册: ${name}`);
    return tool as unknown as AgentTool<T>;
  }
}
