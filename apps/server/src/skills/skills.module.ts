import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from '../entities';
import { AuditModule } from '../audit/audit.module';
import { SkillsController } from './skills.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Skill]), AuditModule],
  controllers: [SkillsController],
})
export class SkillsModule {}