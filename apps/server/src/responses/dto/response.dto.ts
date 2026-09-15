import { z } from 'zod';

export const UpdateResponseDtoSchema = z.object({
  conclusion: z.enum(['FULLY_MET', 'PARTIALLY_MET', 'DEVIATION', 'NOT_MET']).optional(),
  content: z.string().optional(),
  confirmed: z.boolean().optional(),
});

export class UpdateResponseDto {
  conclusion?: 'FULLY_MET' | 'PARTIALLY_MET' | 'DEVIATION' | 'NOT_MET';
  content?: string;
  confirmed?: boolean;
}