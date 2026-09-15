import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BidResponse, Project } from '../entities';
import { AuditModule } from '../audit/audit.module';
import { ResponsesController } from './responses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BidResponse, Project]), AuditModule],
  controllers: [ResponsesController],
})
export class ResponsesModule {}