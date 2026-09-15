import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEvalCaseDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsObject()
  input: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  expected?: Record<string, unknown>;
}

export class RunEvalDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  cardId?: string;
}
