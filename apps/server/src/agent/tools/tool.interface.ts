import { AgentProgressEvent, ToolName } from '@bidstrat/shared';
import { DataSource } from 'typeorm';

export interface ToolContext {
  tenantId: string;
  projectId: string;
  runId: string;
  dataSource: DataSource;
  emit: (type: AgentProgressEvent['type'], message: string, payload?: unknown, stepId?: string) => void;
}

export interface ToolResult {
  output: unknown;
  tokens?: number;
}

export interface AgentTool<I = unknown> {
  readonly name: ToolName;
  run(ctx: ToolContext, input: I): Promise<ToolResult>;
}
