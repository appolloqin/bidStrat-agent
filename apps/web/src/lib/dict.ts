import {
  GateStatus,
  KBAssetType,
  MemoryType,
  ProjectStage,
  ProjectStatus,
  RequirementCategory,
  Role,
  ToolName,
  VersionStatus,
} from '@bidstrat/shared';

export const stageDict: Record<ProjectStage, { text: string; color: string }> = {
  CREATED: { text: '已创建', color: 'default' },
  PARSED: { text: '已解析招标文件', color: 'cyan' },
  REQUIREMENTS_CONFIRMED: { text: '要点已确认', color: 'gold' },
  RESPONSES_CONFIRMED: { text: '应答已确认', color: 'gold' },
  WRITING: { text: '撰写中', color: 'blue' },
  REVIEW: { text: '评审中', color: 'purple' },
  FINALIZED: { text: '已定稿', color: 'green' },
  CLOSED: { text: '已归档', color: 'default' },
};

export const statusDict: Record<ProjectStatus, { text: string; color: string }> = {
  ACTIVE: { text: '进行中', color: 'green' },
  PAUSED: { text: '已暂停', color: 'orange' },
  DONE: { text: '已完成', color: 'blue' },
  ARCHIVED: { text: '已归档', color: 'default' },
};

export const categoryDict: Record<RequirementCategory, { text: string; color: string }> = {
  QUALIFICATION: { text: '资格要求', color: 'blue' },
  TECHNICAL: { text: '技术要求', color: 'geekblue' },
  COMMERCIAL: { text: '商务要求', color: 'orange' },
  SCORING: { text: '评分办法', color: 'purple' },
  DELIVERY: { text: '交付要求', color: 'cyan' },
  DISQUALIFIER: { text: '废标项', color: 'red' },
};

export const conclusionDict = {
  FULLY_MET: { text: '完全满足', color: 'green' },
  PARTIALLY_MET: { text: '部分满足', color: 'gold' },
  DEVIATION: { text: '存在偏离', color: 'orange' },
  NOT_MET: { text: '不满足', color: 'red' },
} as const;

export const sectionStatusDict = {
  GENERATED: { text: 'AI 草稿', color: 'blue' },
  FINALIZED: { text: '已定稿', color: 'green' },
  EDITED: { text: '已编辑', color: 'gold' },
} as const;

export const runStatusDict = {
  PENDING: { text: '等待中', color: 'default' },
  RUNNING: { text: '执行中', color: 'blue' },
  WAITING_HUMAN: { text: '等待人工', color: 'gold' },
  SUCCEEDED: { text: '成功', color: 'green' },
  FAILED: { text: '失败', color: 'red' },
  CANCELLED: { text: '已取消', color: 'default' },
} as const;

export const stepStatusDict = {
  PENDING: { text: '等待中', color: 'default' },
  RUNNING: { text: '执行中', color: 'blue' },
  DONE: { text: '完成', color: 'green' },
  FAILED: { text: '失败', color: 'red' },
  SKIPPED: { text: '跳过', color: 'default' },
} as const;

export const toolDict: Record<ToolName, string> = {
  parse_document: '解析招标文件',
  extract_requirements: '提取招标要点',
  search_knowledge: '检索知识库',
  write_section: '撰写章节',
  self_review: '自评与重写',
  compliance_check: '合规检查',
  export_docx: '导出 Word',
};

export const gateStatusDict: Record<GateStatus, { text: string; color: string }> = {
  PENDING: { text: '待审批', color: 'gold' },
  EVAL_RUNNING: { text: '评估中', color: 'blue' },
  EVAL_PASSED: { text: '评估通过', color: 'cyan' },
  APPROVED: { text: '已批准', color: 'green' },
  REJECTED: { text: '已拒绝', color: 'red' },
  ROLLED_BACK: { text: '已回滚', color: 'default' },
};

export const targetDict = {
  SEMANTIC_MEMORY: { text: '语义记忆', color: 'blue' },
  SKILL: { text: '技能', color: 'purple' },
  EPISODIC_MEMORY: { text: '情景记忆', color: 'cyan' },
} as const;

export const roleDict: Record<Role, string> = {
  SPECIALIST: '投标专员',
  SUPERVISOR: '主管',
  ADMIN: '管理员',
};

export const versionStatusDict: Record<VersionStatus, { text: string; color: string }> = {
  DRAFT: { text: '草稿', color: 'default' },
  ACTIVE: { text: '生效中', color: 'green' },
  GRAY: { text: '灰度', color: 'gold' },
  DISABLED: { text: '已停用', color: 'default' },
  ROLLED_BACK: { text: '已回滚', color: 'orange' },
};

export const memoryTypeDict: Record<MemoryType, { text: string; color: string }> = {
  SEMANTIC: { text: '语义记忆', color: 'blue' },
  EPISODIC: { text: '情景记忆', color: 'purple' },
};

export const kbAssetTypeDict: Record<KBAssetType, string> = {
  QUALIFICATION: '资质证书',
  PERFORMANCE: '项目业绩',
  MATERIAL: '素材',
  RESUME: '人员简历',
  TEMPLATE: '模板',
};

export const auditActionDict: Record<string, string> = {
  'auth.login': '登录',
  'project.create': '创建项目',
  'project.archive': '归档项目',
  'project.run': '启动生成',
  'project.export': '导出标书',
  'project.result': '回填结果',
  'project.close': '结项复盘',
  'tender.upload': '上传招标文件',
  'tender.reparse': '重新解析',
  'requirement.update': '修改招标要点',
  'requirement.batch': '批量确认要点',
  'response.update': '修改应答',
  'response.batch': '批量确认应答',
  'section.rewrite': '重写章节',
  'section.feedback': '保存定稿',
  'memory.create': '新增记忆',
  'memory.update': '更新记忆',
  'memory.disable': '停用记忆',
  'memory.delete': '删除记忆',
  'skill.create': '新增技能',
  'skill.update': '更新技能',
  'skill.rollback': '回滚技能',
  'skill.disable': '停用技能',
  'llm-config.create': '新建模型配置',
  'llm-config.update': '更新模型配置',
  'llm-config.delete': '删除模型配置',
  'llm-config.set-default': '设置默认模型',
  'kb.asset.create': '新增知识资产',
  'kb.asset.update': '更新知识资产',
  'kb.asset.delete': '删除知识资产',
};

export const targetTypeDict: Record<string, string> = {
  project: '项目',
  tender_doc: '招标文件',
  requirement: '招标要点',
  response: '应答',
  section: '章节',
  memory: '记忆',
  skill: '技能',
  kb_asset: '知识资产',
  llm_config: '模型配置',
  user: '用户',
};
