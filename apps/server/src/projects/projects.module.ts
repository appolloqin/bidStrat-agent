import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { EvolutionModule } from '../evolution/evolution.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AgentModule, EvolutionModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
