import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { AgentModule } from './agent/agent.module';
import { KBModule } from './kb/kb.module';
import { EvolutionModule } from './evolution/evolution.module';
import { EvalModule } from './eval/eval.module';
import { AuditModule } from './audit/audit.module';
import { MemoriesModule } from './memories/memories.module';
import { SkillsModule } from './skills/skills.module';
import { RequirementsModule } from './requirements/requirements.module';
import { ResponsesModule } from './responses/responses.module';
import { SectionsModule } from './sections/sections.module';
import { TenderDocsModule } from './tender-docs/tender-docs.module';
import { LlmModule } from './llm/llm.module';
import { HealthController } from './health.controller';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ResponseInterceptor } from './common/response.interceptor';
import { buildDataSourceOptions } from './config/database';
import { SeedService } from './seed/seed.service';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(buildDataSourceOptions()),
    AuthModule,
    UsersModule,
    LlmModule,
    KBModule,
    AgentModule,
    EvolutionModule,
    EvalModule,
    AuditModule,
    MemoriesModule,
    SkillsModule,
    RequirementsModule,
    ResponsesModule,
    SectionsModule,
    TenderDocsModule,
    ProjectsModule,
    SeedModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new (require('@nestjs/common').ValidationPipe)({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    },
    SeedService,
  ],
  exports: [SeedService],
})
export class AppModule {}