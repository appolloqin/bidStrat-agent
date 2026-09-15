import { z } from 'zod';
import { ToolNameSchema, ToolName } from '@bidstrat/shared';

export const UpsertSkillDtoSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().optional(),
  promptTpl: z.string().min(1),
  tools: z.array(ToolNameSchema).optional(),
});

export class UpsertSkillDto {
  name!: string;
  trigger?: string;
  promptTpl!: string;
  tools?: ToolName[];
}