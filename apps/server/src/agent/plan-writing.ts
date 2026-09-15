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

export type WritingPlanResult = {
  chapters: BidOutlineChapter[];
  tokens: number;
  rationale: string;
  source: 'llm' | 'fallback';
};

/**
 * 收集「可能需要作答」的结构线索，仅作规划上下文提示，不强制选中。
 * 刻意保持弱启发：不绑定某一采购平台模板。
 */
export function collectStructureHints(
  outline: OutlinePath[],
  clauses: ClauseAnchor[],
): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (!t || t.length < 2 || seen.has(t)) return;
    seen.add(t);
    hints.push(t.length > 220 ? `${t.slice(0, 220)}…` : t);
  };

  for (const o of outline.slice(0, 200)) {
    const title = (o.path || o.title || '').trim();
    if (!title) continue;
    if (title.length <= 100) push(`目录：${title}`);
  }

  for (const c of clauses) {
    const path = (c.sectionPath || '').trim();
    const head = (c.content || '').slice(0, 240);
    // 短路径一律提供；长正文仅在含「作答意图」弱信号时节选
    if (path && path.length <= 80) push(`路径：${path}`);
    if (/响应|填写|应答|评分|评审|要求|在此处|空白|请投标人|不得修改/.test(`${path}\n${head}`)) {
      push(`条款[${path || '未分组'}]：${head}`);
    }
    if (hints.length >= 100) break;
  }
  return hints;
}

function parsePlanJson(
  raw: string,
  requirements: RequirementAnchor[],
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
    const chapters: BidOutlineChapter[] = [];
    for (const [i, ch] of (obj.chapters ?? []).entries()) {
      const title = String(ch.title ?? ch.name ?? '').trim();
      const path = String(ch.tenderAnchor ?? ch.path ?? ch.anchor ?? title).trim();
      if (!title || !path) continue;
      const ids = Array.isArray(ch.requirementIds)
        ? ch.requirementIds.map(String).filter((id) => reqIds.has(id))
        : [];
      const cats = Array.isArray(ch.categories)
        ? (ch.categories.map(String) as RequirementCategory[])
        : deriveCategories(requirements, ids);
      const context = String(ch.context ?? ch.slotContext ?? '').trim();
      chapters.push({
        no: String(chapters.length + 1),
        title,
        path,
        categories: cats.length ? cats : (['TECHNICAL'] as RequirementCategory[]),
        requirementIds: ids,
        ...(context ? { context } : {}),
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

/**
 * 由模型自主决定：写哪些应答、锚定原文何处。
 * 失败时回退到按要点位置分组（非固定六章模板）。
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
  const hints = collectStructureHints(outline, clauses);
  const reqLines = requirements
    .slice(0, 80)
    .map((r, i) => `${i + 1}. id=${r.id} [${r.category}] ${r.content.slice(0, 120)}`)
    .join('\n');

  const { content, tokens } = await llm.chat(
    [
      {
        role: 'system',
        content: [
          '你是投标文件写作规划专家，负责自主决策「写什么、写在原文哪里」。',
          '只输出一个 JSON 对象，不要 Markdown，不要解释性前后文。',
          'JSON 形状：{"rationale":"简要决策说明","chapters":[{"title":"应答标题","tenderAnchor":"原文锚点标题或路径","requirementIds":["要点id"],"categories":["TECHNICAL"],"context":"写该段时需要的要求/标准摘要"}]}',
          '决策原则：',
          '1) 不要照抄全部招标目录；只规划投标人需要填写或实质性应答的段落。',
          '2) tenderAnchor 尽量使用原文已有标题/路径字面，便于回填到源文件对应位置。',
          '3) 若结构线索中出现明确填写区、响应栏、评分项应答位，应优先锚定这些位置，并在 context 中摘录对应要求与标准。',
          '4) 禁止套用与原文无关的固定六章模板（如凭空写投标函/技术方案骨架）。',
          '5) 章节数量按标书实际需要决定（通常数段到数十段），宁缺毋滥。',
          '6) requirementIds 只能从给定要点 id 中选择；无匹配可给空数组，改用 context 承载写作依据。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          '【结构线索（目录/条款摘要，仅供参考）】',
          hints.join('\n') || '（无线索）',
          '',
          '【已提取招标要点】',
          reqLines || '（无）',
          '',
          '请输出写作规划 JSON。',
        ].join('\n'),
      },
    ],
    { task: 'plan_writing', tenantId },
  );

  const parsed = parsePlanJson(content, requirements);
  if (parsed) {
    return {
      chapters: parsed.chapters,
      tokens,
      rationale: parsed.rationale,
      source: 'llm',
    };
  }

  const fallback = buildOutlineFromTenderPositions({ requirements, clauses });
  return {
    chapters: fallback,
    tokens,
    rationale: '模型规划解析失败，已回退为按要点/条款位置分组',
    source: 'fallback',
  };
}
