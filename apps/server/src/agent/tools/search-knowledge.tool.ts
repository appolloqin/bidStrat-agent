import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../../kb/knowledge.service';
import { AgentTool, ToolContext, ToolResult } from './tool.interface';

@Injectable()
export class SearchKnowledgeTool implements AgentTool<{ query: string; topK?: number }> {
  readonly name = 'search_knowledge' as const;

  constructor(private readonly knowledge: KnowledgeService) {}

  async run(ctx: ToolContext, input: { query: string; topK?: number }): Promise<ToolResult> {
    const hits = await this.knowledge.search(ctx.tenantId, input.query, input.topK ?? 8);
    return { output: { hits } };
  }
}
