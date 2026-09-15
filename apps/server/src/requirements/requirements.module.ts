import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project, Requirement } from '../entities';
import { AuditModule } from '../audit/audit.module';
import { RequirementsController } from './requirements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Requirement]), AuditModule],
  controllers: [RequirementsController],
})
export class RequirementsModule {}