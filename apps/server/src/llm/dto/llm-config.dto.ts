import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class CreateLlmConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsIn(['openai-compatible', 'mock'])
  provider?: 'openai-compatible' | 'mock';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  /** 明文 API Key */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000000)
  maxTokens?: number | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  thinkingEnabled?: boolean;

  /** 创建后设为默认模型；首条配置自动成为默认 */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateLlmConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsIn(['openai-compatible', 'mock'])
  provider?: 'openai-compatible' | 'mock';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  /** 明文 API Key；留空字符串表示清除已保存的 Key；不传则表示保持不变 */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000000)
  maxTokens?: number | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  thinkingEnabled?: boolean;
}

export class TestLlmConfigDto {
  /** 基于已保存配置测试；可与临时覆盖字段组合 */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;
}
