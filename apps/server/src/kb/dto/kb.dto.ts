import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { KBAssetTypeSchema } from '@bidstrat/shared';

export class CreateKbAssetDto {
  @IsIn(KBAssetTypeSchema.options)
  assetType: (typeof KBAssetTypeSchema.options)[number];

  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class UpdateKbAssetDto {
  @IsOptional()
  @IsIn(KBAssetTypeSchema.options)
  assetType?: (typeof KBAssetTypeSchema.options)[number];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class SearchKbDto {
  @IsString()
  @MinLength(1)
  query: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number;
}
