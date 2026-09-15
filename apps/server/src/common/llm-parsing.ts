import { BidResponse } from '../entities';

export type ResponseConclusion = BidResponse['conclusion'];

/**
 * 剥离思考模式的推理块（如 MiniMax M3 的 <think>...</think>）。
 * 兼容未闭合的 <think>（流式截断时按起点截断）。
 */
export function stripThinkBlocks(text: string): string {
  if (!text) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<redacted_reasoning>[\s\S]*?<\/redacted_reasoning>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

/** 英文元推理/自检行（模型把思考过程写进正文时的典型开头） */
const EN_META_LINE =
  /^(Let me |I (should|think|need|will|used|have|did|want|can|would|could|must|am |was )|Wait[,.]|Actually[,.]|Looking |The user |One more |Hmm|Okay[,.]|Alright|Now I |So I |This is |Here(?:'s| is) |Based on |After |Before |First[,.]|Second[,.]|Finally[,.]|Wait[, ]|Note:|TODO:|FIXME:)/i;

/**
 * 清洗 LLM 正文：去思考块、去英文元推理、去掉 Markdown 代码围栏噪音。
 * 写作 / 导出路径必须调用，避免标书出现英文思考过程。
 */
export function sanitizeLlmOutput(text: string): string {
  if (!text) return '';
  let s = stripThinkBlocks(text)
    .replace(/<memory>[\s\S]*?<\/memory>/gi, '')
    .replace(/<\/?memory>/gi, '')
    .replace(/<memories>[\s\S]*?<\/memories>/gi, '')
    .replace(/```(?:json|text|markdown|md)?\s*([\s\S]*?)```/gi, '$1')
    .replace(/\r\n/g, '\n')
    .trim();

  // 去掉模型误输出的 Cursor/agent 记忆 JSON 块
  s = s.replace(/\{"memories"\s*:\s*\[[\s\S]*?\}\s*\}/g, '').trim();

  // 若正文前半仍是大段英文元推理，截到首个中文标题/条款行
  const lines = s.split('\n');
  let start = 0;
  while (start < lines.length) {
    const line = lines[start].trim();
    if (!line) {
      start++;
      continue;
    }
    if (EN_META_LINE.test(line)) {
      start++;
      continue;
    }
    // 纯英文且不像专有名词短词 → 视为元推理残留
    if (/^[A-Za-z][A-Za-z0-9\s,.'"():;\-/]{20,}$/.test(line) && !/[\u4e00-\u9fff]/.test(line)) {
      start++;
      continue;
    }
    break;
  }
  s = lines.slice(start).join('\n').trim();

  // 去掉尾部英文自检段（常见于 “I think this is acceptable...”）
  const outLines = s.split('\n');
  let end = outLines.length;
  while (end > 0) {
    const line = outLines[end - 1].trim();
    if (!line) {
      end--;
      continue;
    }
    if (EN_META_LINE.test(line) || (/^[A-Za-z]/.test(line) && !/[\u4e00-\u9fff]/.test(line) && line.length > 40)) {
      end--;
      continue;
    }
    break;
  }
  return outLines.slice(0, end).join('\n').trim();
}

/**
 * 从 LLM 输出中抽取 JSON 对象。
 * 兼容：纯 JSON、Markdown 代码块、夹杂文字；并对模型常见的「content 内未转义换行/引号」做修复。
 */
export function extractJson<T = Record<string, unknown>>(text: string): T | null {
  if (!text) return null;
  const stripped = stripThinkBlocks(text).replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();

  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };

  let hit = tryParse(stripped);
  if (hit) return hit;

  const braced = stripped.match(/\{[\s\S]*\}/);
  if (braced) {
    hit = tryParse(braced[0]);
    if (hit) return hit;
    hit = tryParse(repairJsonStringNewlines(braced[0]));
    if (hit) return hit;
  }

  // 专门适配 {"conclusion":"...","content":"..."}：即使 content 含裸换行/未转义引号也能抽出
  const draft = extractDraftResponseFields(stripped);
  if (draft) return draft as T;

  const lines = stripped.split(/\r?\n/);
  for (const line of lines.reverse()) {
    const m = line.match(/\{[\s\S]*\}/);
    if (!m) continue;
    hit = tryParse(m[0]) ?? tryParse(repairJsonStringNewlines(m[0]));
    if (hit) return hit;
  }
  return null;
}

/**
 * 修复 JSON 字符串值内的裸换行（LLM 常把多段中文直接换行写进 "content"，导致 Bad control character）。
 * 仅在引号包裹的字符串内部把真实换行换成 \\n，不改动结构字符。
 */
export function repairJsonStringNewlines(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 宽松抽取应答 JSON 字段（不依赖严格 JSON.parse）。
 * 匹配 "conclusion":"ENUM"，再取 "content":"…" 到收尾引号之间的正文（容忍内容里的裸换行）。
 */
export function extractDraftResponseFields(
  text: string,
): { conclusion: string; content: string } | null {
  const conclusionMatch = text.match(
    /"conclusion"\s*:\s*"(FULLY_MET|PARTIALLY_MET|DEVIATION|NOT_MET)"/i,
  );
  if (!conclusionMatch) return null;
  const conclusion = conclusionMatch[1].toUpperCase();

  const m = text.match(/"content"\s*:\s*"/i);
  if (!m || m.index === undefined) return { conclusion, content: '' };
  const start = m.index + m[0].length;

  // 取最后一个 } 前的最后一个 " 作为 content 结束（模型常把换行直接写在 content 里）
  let end = -1;
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace > start) end = text.lastIndexOf('"', lastBrace);
  if (end <= start) end = lastBrace > start ? lastBrace : text.length;

  let content = text.slice(start, end);
  content = content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
  content = content.replace(/["\s]*\}\s*$/u, '').trim();
  return { conclusion, content };
}

/** 把 LLM 的文本结论归一化为枚举 */
export function inferConclusion(text: string): ResponseConclusion {
  const t = (text || '').replace(/\s+/g, '');
  // 正向承诺优先，避免正文复述「废标/不接受」要求时被误判为偏离
  if (/完全满足|Fully_MET|FULLY_MET|郑重承诺.*完全|完全响应|无偏离/.test(t)) return 'FULLY_MET';
  // 优先级：否定 > 偏离 > 部分 > 完全
  if (/不满足本|无法响应|不能满足本项|不符合本项|不提供本项/.test(t)) return 'NOT_MET';
  if (/存在偏离|部分不接受|不可接受该|无法满足.*本条款/.test(t)) return 'DEVIATION';
  if (/部分满足|基本满足|基本响应|原则上响应|有条件响应/.test(t)) return 'PARTIALLY_MET';
  return 'FULLY_MET';
}

/**
 * 解析 LLM 应答输出，失败时尝试从文本推断结论。
 * 返回 { conclusion, content, parsed }：parsed=true 表示 JSON 成功解析。
 */
export function parseDraftResponse(raw: string): {
  conclusion: ResponseConclusion;
  content: string;
  parsed: boolean;
  diagnostic?: string;
} {
  const fallbackContent = sanitizeLlmOutput(raw || '') || '（模型未返回内容）';
  const parsed = extractJson<{ conclusion?: string; content?: string }>(raw);
  if (parsed && typeof parsed === 'object') {
    const validConclusions: ResponseConclusion[] = ['FULLY_MET', 'PARTIALLY_MET', 'DEVIATION', 'NOT_MET'];
    const conclusion = (parsed.conclusion && validConclusions.includes(parsed.conclusion as ResponseConclusion)
      ? (parsed.conclusion as ResponseConclusion)
      : inferConclusion(fallbackContent));
    const content = sanitizeLlmOutput((parsed.content && String(parsed.content).trim()) || fallbackContent);
    return { conclusion, content, parsed: true };
  }
  return {
    conclusion: inferConclusion(fallbackContent),
    content: fallbackContent,
    parsed: false,
    diagnostic: 'JSON 解析失败，已按文本推断结论；建议检查 LLM 是否按 JSON 格式输出。',
  };
}
