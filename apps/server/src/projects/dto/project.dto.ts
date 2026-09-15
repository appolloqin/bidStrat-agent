import { IsBoolean, IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  tenderName: string;

  @IsOptional()
  @IsString()
  tenderNo?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  tenderName?: string;

  @IsOptional()
  @IsString()
  tenderNo?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class RunProjectDto {
  @IsOptional()
  @IsString()
  fromStep?: string;

  @IsOptional()
  @IsBoolean()
  skipHumanCheckpoints?: boolean;

  /** 是否在上传的招标源文件上插入应答；默认 true。false 则新建独立应答文档 */
  @IsOptional()
  @IsBoolean()
  annotateOnSource?: boolean;
}

export class ExportProjectDto {
  /** 是否在上传的招标源文件上插入应答；默认 true。false 则新建独立应答文档 */
  @IsOptional()
  @IsBoolean()
  annotateOnSource?: boolean;
}

export class BackfillResultDto {
  @IsBoolean()
  won: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
