import { z } from 'zod';
import { RequirementCategorySchema } from '@bidstrat/shared';

export const UpdateRequirementDtoSchema = z.object({
  content: z.string().optional(),
  category: RequirementCategorySchema.optional(),
  mandatory: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});

export class UpdateRequirementDto {
  content?: string;
  category?: 'QUALIFICATION' | 'TECHNICAL' | 'COMMERCIAL' | 'SCORING' | 'DELIVERY' | 'DISQUALIFIER';
  mandatory?: boolean;
  confirmed?: boolean;
}