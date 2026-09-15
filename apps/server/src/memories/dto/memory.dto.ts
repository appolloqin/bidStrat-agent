import { z } from 'zod';
import { MemoryTypeSchema } from '@bidstrat/shared';

export const UpsertMemoryDtoSchema = z.object({
  memType: MemoryTypeSchema,
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export class UpsertMemoryDto {
  memType!: 'SEMANTIC' | 'EPISODIC';
  content!: string;
  tags?: string[];
  confidence?: number;
}