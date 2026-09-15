import { z } from "zod";

export const RoleSchema = z.enum(["SPECIALIST", "SUPERVISOR", "ADMIN"]);
export type Role = z.infer<typeof RoleSchema>;

export const ProjectStageSchema = z.enum([
  "CREATED",
  "PARSED",
  "REQUIREMENTS_CONFIRMED",
  "RESPONSES_CONFIRMED",
  "WRITING",
  "REVIEW",
  "FINALIZED",
  "CLOSED",
]);
export type ProjectStage = z.infer<typeof ProjectStageSchema>;

export const ProjectStatusSchema = z.enum(["ACTIVE", "PAUSED", "DONE", "ARCHIVED"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const RequirementCategorySchema = z.enum([
  "QUALIFICATION",
  "TECHNICAL",
  "COMMERCIAL",
  "SCORING",
  "DELIVERY",
  "DISQUALIFIER",
]);
export type RequirementCategory = z.infer<typeof RequirementCategorySchema>;

export const FeedbackActionSchema = z.enum(["ACCEPTED", "MINOR_EDIT", "MAJOR_EDIT", "REWRITE"]);
export type FeedbackAction = z.infer<typeof FeedbackActionSchema>;

export const MemoryTypeSchema = z.enum(["SEMANTIC", "EPISODIC"]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const GateStatusSchema = z.enum(["PENDING", "EVAL_RUNNING", "EVAL_PASSED", "APPROVED", "REJECTED", "ROLLED_BACK"]);
export type GateStatus = z.infer<typeof GateStatusSchema>;

export const VersionStatusSchema = z.enum(["DRAFT", "ACTIVE", "GRAY", "DISABLED", "ROLLED_BACK"]);
export type VersionStatus = z.infer<typeof VersionStatusSchema>;

export const AgentRunStatusSchema = z.enum(["PENDING", "RUNNING", "WAITING_HUMAN", "SUCCEEDED", "FAILED", "CANCELLED"]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const ToolNameSchema = z.enum([
  "parse_document",
  "extract_requirements",
  "search_knowledge",
  "write_section",
  "self_review",
  "compliance_check",
  "export_docx",
]);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const KBAssetTypeSchema = z.enum(["QUALIFICATION", "PERFORMANCE", "MATERIAL", "RESUME", "TEMPLATE"]);
export type KBAssetType = z.infer<typeof KBAssetTypeSchema>;

export const ApiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.optional() });
export interface ApiResponse<T> {
  code: number;
  message: string;
  data?: T;
}

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const CreateProjectInputSchema = z.object({
  tenderName: z.string().min(1),
  tenderNo: z.string().optional(),
  deadline: z.string().datetime().optional(),
  remark: z.string().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateRequirementInputSchema = z.object({
  content: z.string().optional(),
  category: RequirementCategorySchema.optional(),
  mandatory: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});
export type UpdateRequirementInput = z.infer<typeof UpdateRequirementInputSchema>;

export const UpdateResponseInputSchema = z.object({
  conclusion: z.enum(["FULLY_MET", "PARTIALLY_MET", "DEVIATION", "NOT_MET"]).optional(),
  content: z.string().optional(),
  confirmed: z.boolean().optional(),
});
export type UpdateResponseInput = z.infer<typeof UpdateResponseInputSchema>;

export const RewriteSectionInputSchema = z.object({
  instruction: z.string().min(1),
});
export type RewriteSectionInput = z.infer<typeof RewriteSectionInputSchema>;

export const SaveSectionFeedbackInputSchema = z.object({
  finalContent: z.string(),
  rating: z.enum(["GOOD", "OK", "REWRITE"]).optional(),
  comment: z.string().optional(),
});
export type SaveSectionFeedbackInput = z.infer<typeof SaveSectionFeedbackInputSchema>;

export const UpsertMemoryInputSchema = z.object({
  memType: MemoryTypeSchema,
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type UpsertMemoryInput = z.infer<typeof UpsertMemoryInputSchema>;

export const UpsertSkillInputSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().optional(),
  promptTpl: z.string().min(1),
  tools: z.array(ToolNameSchema).optional(),
});
export type UpsertSkillInput = z.infer<typeof UpsertSkillInputSchema>;

export const CreateKBAssetInputSchema = z.object({
  assetType: KBAssetTypeSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  meta: z.record(z.unknown()).optional(),
});
export type CreateKBAssetInput = z.infer<typeof CreateKBAssetInputSchema>;

export const SearchKnowledgeInputSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).default(8),
});
export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeInputSchema>;

export const RunProjectInputSchema = z.object({
  fromStep: z.string().optional(),
  skipHumanCheckpoints: z.boolean().optional(),
});
export type RunProjectInput = z.infer<typeof RunProjectInputSchema>;

export const BackfillResultInputSchema = z.object({
  won: z.boolean(),
  note: z.string().optional(),
});
export type BackfillResultInput = z.infer<typeof BackfillResultInputSchema>;

export interface AgentPlanStep {
  id: string;
  tool: ToolName;
  title: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  humanCheckpoint?: boolean;
}

export interface AgentProgressEvent {
  runId: string;
  projectId: string;
  type: "step_start" | "step_end" | "log" | "run_end" | "waiting_human";
  stepId?: string;
  message: string;
  payload?: unknown;
  at: string;
}

export interface ComplianceFinding {
  level: "RED" | "YELLOW" | "GREEN";
  category: string;
  message: string;
  refClauseId?: string;
  refSectionId?: string;
}

export interface SelfReviewResult {
  score: number;
  lostPoints: string[];
  suggestions: string[];
}

export interface ExperienceCardRule {
  scenario: string;
  before: string;
  after: string;
  rule: string;
  target: "SEMANTIC_MEMORY" | "SKILL" | "EPISODIC_MEMORY";
}
