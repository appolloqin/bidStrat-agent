import { AgentRun } from './agent-run.entity';
import { AgentStep } from './agent-step.entity';
import { AuditLog } from './audit-log.entity';
import { BidResponse } from './response.entity';
import { BidSection } from './bid-section.entity';
import { Clause } from './clause.entity';
import { EditFeedback } from './edit-feedback.entity';
import { EvalCase } from './eval-case.entity';
import { EvalReport } from './eval-report.entity';
import { ExperienceCard } from './experience-card.entity';
import { KBAsset } from './kb-asset.entity';
import { KBChunk } from './kb-chunk.entity';
import { LlmConfig } from './llm-config.entity';
import { Memory } from './memory.entity';
import { Project } from './project.entity';
import { Requirement } from './requirement.entity';
import { Skill } from './skill.entity';
import { TenderDoc, OutlineNode } from './tender-doc.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

export const entities = [
  Tenant,
  User,
  Project,
  TenderDoc,
  Clause,
  Requirement,
  BidResponse,
  BidSection,
  EditFeedback,
  Memory,
  Skill,
  ExperienceCard,
  KBAsset,
  KBChunk,
  LlmConfig,
  AgentRun,
  AgentStep,
  EvalCase,
  EvalReport,
  AuditLog,
];

export {
  AgentRun,
  AgentStep,
  AuditLog,
  BidResponse,
  BidSection,
  Clause,
  EditFeedback,
  EvalCase,
  EvalReport,
  ExperienceCard,
  KBAsset,
  KBChunk,
  LlmConfig,
  Memory,
  Project,
  Requirement,
  Skill,
  TenderDoc,
  Tenant,
  User,
};

export type { OutlineNode };
export type { LlmProvider } from './llm-config.entity';
