import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Memory } from '../entities';
import { AuditModule } from '../audit/audit.module';
import { MemoriesController } from './memories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Memory]), AuditModule],
  controllers: [MemoriesController],
})
export class MemoriesModule {}