import { RequirementCategory } from '@bidstrat/shared';
import { BidOutlineChapter, ClauseAnchor, OutlinePath, RequirementAnchor } from './plan';

const MARKER_RE = /#{0,3}\s*【\s*([^】]+?)\s*】/g;
const FILL_INSTRUCTION_RE = /投标人在此处编辑|不得在上述|不得删除或修改任何招标文件原始文字/;

export type ResponseSlot = {
  group: string;
  /** 原文锚点，优先完整 ##【…/投标响应】 以便导出命中 */
  responseAnchor: string;
  itemTitle: string;
  requirementText: string[];
  scoringText: string[];
  order: number;
};

function classifyMarker(inner: string): {
  kind: 'response' | 'requirement' | 'scoring' | 'item';
  group: string;
  label: string;
} {
  const cleaned = inner.replace(/\s+/g, '').trim();
  // 通用：…/投标响应|填写|应答 等作答位；…/评分|评审|招标文件要求 作上下文
  const m = cleaned.match(/^(.+?)\/(投标响应|填写区|应答|响应内容|评分标准|招标文件要求|评审标准)$/);
  if (m) {
    const kind =
      /投标响应|填写区|应答|响应内容/.test(m[2])
        ? 'response'
        : m[2] === '招标文件要求'
          ? 'requirement'
          : 'scoring';
    return { kind, group: m[1], label: cleaned };
  }
  if (/响应|填写/.test(cleaned) && cleaned.length <= 40) {
    return { kind: 'response', group: cleaned, label: cleaned };
  }
  return { kind: 'item', group: cleaned.replace(/[：:].*$/, ''), label: cleaned };
}

function ensureBucket(map: Map<string, ResponseSlot>, group: string, order: number): ResponseSlot {
  let b = map.get(group);
  if (!b) {
    b = {
      group,
      responseAnchor: '',
      itemTitle: group,
      requirementText: [],
      scoringText: [],
      order,
    };
    map.set(group, b);
  }
  b.order = Math.min(b.order, order);
  return b;
}

/**
 * 从大纲/条款中发现「填写区」结构（不绑定某一采购平台文案，只认 【组/角色】 标记）。
 * 用于：规划必须覆盖、导出必须回填——不是给每个槽单独写提示词。
 */
export function discoverResponseSlots(
  clauses: ClauseAnchor[],
  outline: OutlinePath[] = [],
): ResponseSlot[] {
  const map = new Map<string, ResponseSlot>();
  let seq = 0;

  const ingest = (rawInner: string, body: string, order: number) => {
    const { kind, group, label } = classifyMarker(rawInner);
    const b = ensureBucket(map, group, order);
    if (kind === 'item' && label) b.itemTitle = label;
    if (kind === 'response') {
      b.responseAnchor = `##【${label}】`;
    } else if (kind === 'requirement') {
      const t = body.replace(FILL_INSTRUCTION_RE, '').trim();
      if (t) b.requirementText.push(t);
    } else if (kind === 'scoring') {
      const t = body.trim();
      if (t) b.scoringText.push(t);
    }
  };

  for (const o of outline) {
    const path = (o.path || o.title || '').trim();
    if (!path) continue;
    seq++;
    MARKER_RE.lastIndex = 0;
    const m = MARKER_RE.exec(path);
    if (m) ingest(m[1], '', seq);
  }

  for (const c of clauses) {
    seq++;
    const path = (c.sectionPath || '').trim();
    MARKER_RE.lastIndex = 0;
    const pathMark = MARKER_RE.exec(path);
    if (pathMark) ingest(pathMark[1], c.content || '', seq);

    const content = c.content || '';
    if (!/【[^】]+】/.test(content) && !pathMark) continue;

    const parts: { marker?: string; body: string }[] = [];
    const re = new RegExp(MARKER_RE.source, 'g');
    let last = 0;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(content)) !== null) {
      if (mm.index > last) {
        const prev = parts[parts.length - 1];
        if (prev) prev.body += content.slice(last, mm.index);
        else parts.push({ body: content.slice(last, mm.index) });
      }
      parts.push({ marker: mm[1], body: '' });
      last = mm.index + mm[0].length;
    }
    if (last < content.length) {
      const prev = parts[parts.length - 1];
      if (prev) prev.body += content.slice(last);
      else parts.push({ body: content.slice(last) });
    }
    for (const p of parts) {
      if (p.marker) ingest(p.marker, p.body, seq);
    }
  }

  return [...map.values()]
    .filter((b) => b.responseAnchor)
    .sort((a, b) => a.order - b.order);
}

export function slotToChapter(slot: ResponseSlot, index: number, requirements: RequirementAnchor[]): BidOutlineChapter {
  const ctxParts: string[] = [];
  if (slot.itemTitle) ctxParts.push(`评分项：${slot.itemTitle}`);
  if (slot.requirementText.length) ctxParts.push(`招标文件要求：\n${slot.requirementText.join('\n')}`);
  if (slot.scoringText.length) ctxParts.push(`评分/评审标准：\n${slot.scoringText.join('\n')}`);
  const context = ctxParts.join('\n\n').slice(0, 6000);
  const hay = `${slot.itemTitle}\n${context}`.toLowerCase();

  const matched = requirements.filter((r) => {
    const piece = (r.content || '').slice(0, 40).toLowerCase();
    return piece.length >= 6 && hay.includes(piece.slice(0, Math.min(24, piece.length)));
  });
  const categories = [
    ...new Set(matched.map((r) => r.category).filter(Boolean)),
  ] as RequirementCategory[];
  if (!categories.length) categories.push('TECHNICAL', 'SCORING');

  return {
    no: String(index + 1),
    title: `对「${slot.group}」的投标响应`,
    path: slot.responseAnchor,
    categories,
    requirementIds: matched.map((r) => r.id),
    ...(context ? { context } : {}),
  };
}

/**
 * 若原文存在填写区：以填写区为必写清单；模型规划中与填写区无关的额外章可保留在后。
 * @deprecated 已改为自主规划 + 校验纠偏，不再硬合并。保留函数仅供测试/兼容。
 */
export function mergePlanWithResponseSlots(
  planned: BidOutlineChapter[],
  slots: ResponseSlot[],
  requirements: RequirementAnchor[],
): BidOutlineChapter[] {
  if (slots.length === 0) return planned;
  const slotChapters = slots.map((s, i) => slotToChapter(s, i, requirements));
  const covered = new Set(slotChapters.map((c) => normalizeAnchor(c.path)));
  const extras = planned.filter((ch) => !covered.has(normalizeAnchor(ch.path)));
  return [...slotChapters, ...extras].map((ch, i) => ({ ...ch, no: String(i + 1) }));
}

/** 规划是否覆盖了原文填写区（用于自主决策后的校验，不直接改写规划） */
export function evaluateFillZoneCoverage(
  planned: BidOutlineChapter[],
  slots: ResponseSlot[],
): { covered: string[]; missed: string[]; ratio: number } {
  if (slots.length === 0) return { covered: [], missed: [], ratio: 1 };
  const covered: string[] = [];
  const missed: string[] = [];
  for (const slot of slots) {
    const sn = normalizeAnchor(slot.responseAnchor);
    const hit = planned.some((ch) => {
      const pn = normalizeAnchor(ch.path);
      const tn = normalizeAnchor(ch.title);
      return (
        pn === sn ||
        pn.includes(sn) ||
        sn.includes(pn) ||
        pn.includes(normalizeAnchor(slot.group)) ||
        tn.includes(normalizeAnchor(slot.group))
      );
    });
    if (hit) covered.push(slot.responseAnchor);
    else missed.push(slot.responseAnchor);
  }
  return { covered, missed, ratio: covered.length / slots.length };
}

function normalizeAnchor(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/^#{1,3}/, '');
}

/** 正文是否只是「投标人在此处编辑…」类须知（无实质应答） */
export function isFillInstructionOnly(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  if (!FILL_INSTRUCTION_RE.test(t)) return false;
  // 去掉须知后几乎没有汉字 → 视为未写
  const rest = t
    .replace(/投标人在此处编辑[\s\S]{0,200}/g, '')
    .replace(/如招标文件要求中有需要投标人填写[\s\S]{0,200}/g, '')
    .replace(/不得在上述[\s\S]{0,80}/g, '')
    .replace(/\s+/g, '');
  const zh = (rest.match(/[\u4e00-\u9fff]/g) || []).length;
  return zh < 40;
}
