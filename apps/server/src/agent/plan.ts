import { AgentPlanStep, RequirementCategory } from '@bidstrat/shared';

export function buildPlan(): AgentPlanStep[] {
  return [
    { id: 'parse', tool: 'parse_document', title: '解析招标文件', status: 'PENDING' },
    { id: 'requirements', tool: 'extract_requirements', title: '提取招标要点', status: 'PENDING', humanCheckpoint: true },
    { id: 'responses', tool: 'search_knowledge', title: '生成应答矩阵', status: 'PENDING', humanCheckpoint: true },
    { id: 'write', tool: 'write_section', title: '分章写作与自评', status: 'PENDING' },
    { id: 'compliance', tool: 'compliance_check', title: '合规自检', status: 'PENDING' },
    { id: 'export', tool: 'export_docx', title: '导出标书', status: 'PENDING' },
  ];
}

/** 仅当无要点且模型规划失败时的最后兜底骨架 */
export const DEFAULT_OUTLINE: { no: string; title: string; categories: RequirementCategory[] }[] = [
  { no: '1', title: '投标函', categories: [] },
  { no: '2', title: '资格证明文件', categories: ['QUALIFICATION', 'DISQUALIFIER'] },
  { no: '3', title: '技术方案', categories: ['TECHNICAL'] },
  { no: '4', title: '商务响应方案', categories: ['COMMERCIAL'] },
  { no: '5', title: '项目实施与售后服务', categories: ['DELIVERY'] },
  { no: '6', title: '评标办法逐条响应', categories: ['SCORING'] },
];

export type BidOutlineChapter = {
  no: string;
  title: string;
  /** 招标文件中的对应位置（章节路径/条款位置）——导出时用于原文锚点 */
  path: string;
  categories: RequirementCategory[];
  /** 本组需要点对点应答的要点 ID */
  requirementIds: string[];
  /** 模型规划给出的写作依据摘要（要求/标准等） */
  context?: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  QUALIFICATION: '资格要求',
  TECHNICAL: '技术要求',
  COMMERCIAL: '商务要求',
  SCORING: '评标办法',
  DELIVERY: '交付与售后',
  DISQUALIFIER: '废标与否决项',
};

export type RequirementAnchor = {
  id: string;
  category: RequirementCategory | string;
  content: string;
  sortOrder: number;
  clauseId?: string | null;
};

export type ClauseAnchor = {
  id: string;
  sectionPath: string;
  clauseNo: string | null;
  content: string;
};

export type OutlinePath = { title?: string; path?: string };

/**
 * 回退方案：按招标文件条款位置 / 要点类别分组（不是固定模板臆造）。
 */
export function buildOutlineFromTenderPositions(opts: {
  requirements: RequirementAnchor[];
  clauses?: ClauseAnchor[];
}): BidOutlineChapter[] {
  const reqs = [...opts.requirements].sort((a, b) => a.sortOrder - b.sortOrder);
  if (reqs.length === 0) {
    return DEFAULT_OUTLINE.map((ch, i) => ({
      no: String(i + 1),
      title: ch.title,
      path: ch.title,
      categories: ch.categories,
      requirementIds: [],
    }));
  }

  const clauseById = new Map((opts.clauses ?? []).map((c) => [c.id, c]));
  type Group = {
    path: string;
    title: string;
    categories: Set<string>;
    requirementIds: string[];
    sortKey: number;
  };
  const groups = new Map<string, Group>();

  for (const r of reqs) {
    const clause = r.clauseId ? clauseById.get(r.clauseId) : undefined;
    const path =
      (clause?.sectionPath && clause.sectionPath.trim()) ||
      CATEGORY_LABEL[r.category] ||
      String(r.category);
    const title = clause?.sectionPath?.trim()
      ? `对「${trimTitle(clause.sectionPath)}」的应答`
      : `对招标【${CATEGORY_LABEL[r.category] || r.category}】的应答`;
    const key = path;
    let g = groups.get(key);
    if (!g) {
      g = {
        path,
        title,
        categories: new Set(),
        requirementIds: [],
        sortKey: r.sortOrder,
      };
      groups.set(key, g);
    }
    g.categories.add(r.category);
    g.requirementIds.push(r.id);
    g.sortKey = Math.min(g.sortKey, r.sortOrder);
  }

  return [...groups.values()]
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((g, i) => ({
      no: String(i + 1),
      title: g.title,
      path: g.path,
      categories: [...g.categories] as RequirementCategory[],
      requirementIds: g.requirementIds,
    }));
}

function trimTitle(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}
