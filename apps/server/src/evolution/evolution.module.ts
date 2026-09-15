import { Module } from '@nestjs/common';
import { EvalModule } from '../eval/eval.module';
import { EvolutionService } from './evolution.service';
import { ExperienceCardsController } from './experience-cards.controller';

@Module({
  imports: [EvalModule],
  controllers: [ExperienceCardsController],
  providers: [EvolutionService],
  exports: [EvolutionService],
})
export class EvolutionModule {}
