import { IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateCardDto {
  @IsString()
  @MinLength(1)
  scenario: string;

  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @IsString()
  after?: string;

  @IsString()
  @MinLength(1)
  rule: string;

  @IsIn(['SEMANTIC_MEMORY', 'SKILL', 'EPISODIC_MEMORY'])
  target: 'SEMANTIC_MEMORY' | 'SKILL' | 'EPISODIC_MEMORY';

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}
