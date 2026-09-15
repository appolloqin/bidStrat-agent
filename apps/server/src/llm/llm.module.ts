import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmConfig } from '../entities';
import { LlmService } from './llm.service';
import { ModelConfigService } from './model-config.service';
import { LlmConfigController } from './llm-config.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LlmConfig])],
  controllers: [LlmConfigController],
  providers: [LlmService, ModelConfigService],
  exports: [LlmService, ModelConfigService],
})
export class LlmModule {}
