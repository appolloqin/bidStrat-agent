import { RequirementCategory } from '@bidstrat/shared';
import { LlmService } from '../llm/llm.service';
import { sanitizeLlmOutput } from '../common/llm-parsing';
import {
  BidOutlineChapter,
  ClauseAnchor,
  OutlinePath,
  RequirementAnchor,
  buildOutlineFromTenderPositions,
} from './plan';
import { discoverResponseSlots, evaluateFillZoneCoverage } from './response-slots';

export type WritingPlanResult = {
  chapters: BidOutlineChapter[];
  tokens: number;
  rationale: string;
  source: 'llm' | 'fallback';
  rounds?: number;
  /** 阶段一枚举到的候选位置数 */
  candidateCount?: number;
};

/** 阶段一：可能需要作答的原文位置（只枚举，不决定写不写） */
export type WriteCandidate = {
  id: string;
  /** 原文锚点字面 */
  anchor: string;
  kind: 'fill_zone' | 'heading' | 'clause';
  /** 给模型看的摘要（要求/标准/条款片段） */
  synopsis: string;
};

/**
 * 阶段一 · 枚举：找出所有「可能需要写」的位置。
 * 不替模型做取舍；填写区、目录标题、相关条款都作为候选。
 */
export function enumerateWriteCandidates(
  outline: OutlinePath[],
  clauses: ClauseAnchor[],
): WriteCandidate[] {
  const out: WriteCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: Omit<WriteCandidate, 'id'>) => {
    const key = c.anchor.replace(/\s+/g, '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...c, id: `C${out.length + 1}` });
  };

  const slots = discoverResponseSlots(clauses, outline);
  for (const s of slots) {
    const syn = [
      s.itemTitle ? `评分项：${s.itemTitle}` : '',
      s.requirementText[0] ? `要求摘要：${s.requirementText[0].slice(0, 180)}` : '',
      s.scoringText[0] ? `标准摘要：${s.scoringText[0].slice(0, 180)}` : '',
    ]
      .filter(Boolean)
      .join('；');
    push({
      anchor: s.responseAnchor,
      kind: 'fill_zone',
      synopsis: syn || '原文填写区/投标响应栏',
    });
  }

  for (const o of outline.slice(0, 180)) {
    const title = (o.path || o.title || '').trim();
    if (!title || title.length > 80) continue;
    if (/目录|页码|附表|附件清单/.test(title)) continue;
    push({
      anchor: title,
      kind: 'heading',
      synopsis: '招标目录/标题节点',
    });
  }

  for (const c of clauses) {
    const path = (c.sectionPath || '').trim();
    const head = (c.content || '').trim();
    if (!path || path.length > 80) continue;
    if (!/要求|评分|评审|响应|资格|技术|商务|服务|交付|废标|否决/.test(`${path}\n${head.slice(0, 80)}`)) {
      continue;
    }
    push({
      anchor: path,
      kind: 'clause',
      synopsis: head.slice(0, 160) || '相关条款',
    });
  }

  return out.slice(0, 80);
}

function parsePlanJson(
  raw: string,
  requirements: RequirementAnchor[],
  candidates: WriteCandidate[],
): { rationale: string; chapters: BidOutlineChapter[] } | null {
  const text = sanitizeLlmOutput(raw);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as {
      rationale?: string;
      chapters?: Array<Record<string, unknown>>;
    };
    const reqIds = new Set(requirements.map((r) => r.id));
    const candById = new Map(candidates.map((c) => [c.id, c]));
    const chapters: BidOutlineChapter[] = [];

    for (const ch of obj.chapters ?? []) {
      const candId = String(ch.candidateId ?? ch.id ?? '').trim();
      const cand = candId ? candById.get(candId) : undefined;
      const title = String(ch.title ?? ch.name ?? cand?.anchor ?? '').trim();
      // 优先用候选字面锚点，避免模型另造位置
      const path = String(
        cand?.anchor ?? ch.tenderAnchor ?? ch.path ?? ch.anchor ?? title,
      ).trim();
      if (!title || !path) continue;

      const ids = Array.isArray(ch.requirementIds)
        ? ch.requirementIds.map(String).filter((id) => reqIds.has(id))
        : [];
      const cats = Array.isArray(ch.categories)
        ? (ch.categories.map(String) as RequirementCategory[])
        : deriveCategories(requirements, ids);
      const how = String(ch.how ?? ch.approach ?? '').trim();
      const contextParts = [
        String(ch.context ?? '').trim(),
        how ? `写法要点：${how}` : '',
        cand?.synopsis ? `位置摘要：${cand.synopsis}` : '',
      ].filter(Boolean);

      chapters.push({
        no: String(chapters.length + 1),
        title,
        path,
        categories: cats.length ? cats : (['TECHNICAL'] as RequirementCategory[]),
        requirementIds: ids,
        ...(contextParts.length ? { context: contextParts.join('\n').slice(0, 6000) } : {}),
      });
    }

    if (chapters.length === 0) return null;
    return {
      rationale: String(obj.rationale ?? '').trim() || '模型已给出写作清单',
      chapters,
    };
  } catch {
    return null;
  }
}

function deriveCategories(
  requirements: RequirementAnchor[],
  ids: string[],
): RequirementCategory[] {
  const set = new Set<RequirementCategory>();
  for (const id of ids) {
    const r = requirements.find((x) => x.id === id);
    if (r?.category) set.add(r.category as RequirementCategory);
  }
  return [...set];
}

const DECIDE_SYSTEM = [
  '你是投标文件写作规划专家。',
  '输入已给出「全部候选作答位置」（阶段一枚举结果）。你只做阶段二自主决策：',
  '哪些需要写、怎么写、写在什么位置（必须从候选中选）。',
  '只输出一个 JSON 对象，不要 Markdown。',
  'JSON：{"rationale":"总体决策说明","chapters":[{"candidateId":"C1","title":"应答标题","how":"怎么写的要点","requirementIds":["要点id"],"categories":["TECHNICAL"],"context":"该位置写作依据摘要"}]}',
  '规则：',
  '1) candidateId 必须来自候选列表；tenderAnchor 由系统按 candidateId 回填，你不要另造原文没有的位置。',
  '2) 不必全选：跳过纯目录/重复/无需投标人填写的位置，并在 rationale 说明取舍。',
  '3) kind=fill_zone 的填写区通常是投标人作答栏，优先认真评估是否需要写入实质应答。',
  '4) 禁止用与候选无关的固定六章模板替代填写区。',
  '5) requirementIds 只能从给定要点 id 中选，可空。',
].join('\n');

/**
 * 自主写作规划 = 两阶段：
 * 1) 枚举所有可能需要写的位置（结构化，不决策）
 * 2) 模型思考：写哪些、怎么写、锚在哪（从候选中选）
 * 若首轮对填写区覆盖过低，再给一次校验反馈让模型自行纠偏。
 */
export async function planWritingByLlm(
  llm: LlmService,
  opts: {
    tenantId: string;
    outline: OutlinePath[];
    clauses: ClauseAnchor[];
    requirements: RequirementAnchor[];
  },
): Promise<WritingPlanResult> {
  const { tenantId, outline, clauses, requirements } = opts;

  // —— 阶段一：枚举 ——
  const candidates = enumerateWriteCandidates(outline, clauses);
  const slots = discoverResponseSlots(clauses, outline);
  const candLines = candidates
    .map((c) => `${c.id} [${c.kind}] anchor=${c.anchor}｜${c.synopsis.slice(0, 120)}`)
    .join('\n');
  const reqLines = requirements
    .slice(0, 80)
    .map((r, i) => `${i + 1}. id=${r.id} [${r.category}] ${r.content.slice(0, 120)}`)
    .join('\n');

  let tokens = 0;

  // —— 阶段二：决策 ——
  const first = await llm.chat(
    [
      { role: 'system', content: DECIDE_SYSTEM },
      {
        role: 'user',
        content: [
          `【阶段一·全部候选作答位置】共 ${candidates.length} 处`,
          candLines || '（无候选，请根据要点自行保守规划，仍输出 JSON）',
          '',
          '【已提取招标要点】',
          reqLines || '（无）',
          '',
          '请完成阶段二自主决策，输出 JSON。',
        ].join('\n'),
      },
    ],
    { task: 'plan_writing', tenantId },
  );
  tokens += first.tokens;

  let parsed = parsePlanJson(first.content, requirements, candidates);
  let rounds = 1;

  if (parsed && slots.length > 0) {
    const cov = evaluateFillZoneCoverage(parsed.chapters, slots);
    if (cov.ratio < 0.5 && cov.missed.length > 0) {
      const critique = await llm.chat(
        [
          { role: 'system', content: DECIDE_SYSTEM },
          {
            role: 'user',
            content: [
              '阶段二校验未通过，请自主修正后重新输出完整 JSON。',
              `上一轮 rationale：${parsed.rationale}`,
              `上一轮选中：${parsed.chapters.map((c) => c.path).join('；')}`,
              `填写区候选覆盖率仅 ${Math.round(cov.ratio * 100)}%，未覆盖：${cov.missed.join('；')}`,
              '若某填写区确可不写，须在 rationale 说明；否则请用对应 candidateId 补入。',
              '',
              `【阶段一·全部候选】共 ${candidates.length} 处`,
              candLines,
              '',
              '【已提取招标要点】',
              reqLines || '（无）',
            ].join('\n'),
          },
        ],
        { task: 'plan_writing', tenantId },
      );
      tokens += critique.tokens;
      const revised = parsePlanJson(critique.content, requirements, candidates);
      if (revised) {
        parsed = revised;
        rounds = 2;
      }
    }
  }

  if (parsed) {
    return {
      chapters: parsed.chapters,
      tokens,
      rationale:
        rounds > 1
          ? `（枚举 ${candidates.length} 处候选 → 决策纠偏）${parsed.rationale}`
          : `（枚举 ${candidates.length} 处候选 → 决策）${parsed.rationale}`,
      source: 'llm',
      rounds,
      candidateCount: candidates.length,
    };
  }

  const fallback = buildOutlineFromTenderPositions({ requirements, clauses });
  return {
    chapters: fallback,
    tokens,
    rationale: '模型决策解析失败，已回退为按要点/条款位置分组',
    source: 'fallback',
    rounds: 0,
    candidateCount: candidates.length,
  };
}
