import { readFile } from 'fs/promises';
import JSZip from 'jszip';

export type DocxResponseInsert = {
  /** 招标原文位置（章节标题/路径），用于定位插入点 */
  anchor: string;
  title: string;
  content: string;
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalize(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/[\t\r\n]/g, '');
}

function isFillInstruction(text: string): boolean {
  return /投标人在此处编辑|不得在上述|不得删除或修改任何招标文件原始文字/.test(text);
}

function isResponseSlotHeading(text: string): boolean {
  const t = text.trim();
  return (
    /^#{0,3}\s*【[^】]*投标响应[^】]*】\s*$/.test(t) ||
    (/投标响应/.test(t) && t.length <= 40 && !isFillInstruction(t))
  );
}

/** 从段落 XML 抽出纯文本 */
function paragraphText(pXml: string): string {
  const texts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pXml)) !== null) {
    texts.push(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
  }
  return texts.join('');
}

function buildResponseParagraphs(title: string, content: string): string {
  const head = `<w:p><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="C00000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${xmlEscape(`【应答】${title}`)}</w:t></w:r></w:p>`;
  const lines = (content || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && i < arr.length - 1));
  const body = lines
    .map((line) => {
      if (!line.trim()) {
        return `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>`;
      }
      return `<w:p><w:pPr><w:spacing w:after="60" w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="仿宋" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`;
    })
    .join('');
  return head + body;
}

/**
 * 在原始招标 DOCX 的对应标题段落后插入【应答】块，保留原文样式与结构。
 * 优先锚定「##【…/投标响应】」标题段，避开填写须知长文。
 */
export async function annotateDocxWithResponses(
  sourceAbsPath: string,
  responses: DocxResponseInsert[],
): Promise<{ buffer: Buffer; inserted: number; unmatched: string[] }> {
  const raw = await readFile(sourceAbsPath);
  const zip = await JSZip.loadAsync(raw);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('无效的 Word 文档：缺少 word/document.xml');
  let xml = await docFile.async('string');

  const parts = xml.split(/(<\/w:p>)/);
  const paragraphs: { openIdx: number; xml: string; text: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '</w:p>' && i > 0) {
      const chunk = parts[i - 1];
      const pStart = chunk.lastIndexOf('<w:p');
      if (pStart >= 0) {
        const pXml = chunk.slice(pStart) + '</w:p>';
        paragraphs.push({ openIdx: i - 1, xml: pXml, text: paragraphText(pXml) });
      }
    }
  }

  const pending = responses
    .filter((r) => (r.anchor || r.title) && r.content?.trim())
    .map((r) => ({
      ...r,
      normAnchor: normalize(r.anchor || r.title),
      prefersResponseSlot: /投标响应/.test(r.anchor || r.title || ''),
    }));

  const unmatched: string[] = [];
  const insertAfter = new Map<number, string>();

  for (const resp of pending) {
    if (!resp.normAnchor) {
      unmatched.push(resp.title);
      continue;
    }
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const rawText = paragraphs[i].text || '';
      const pt = normalize(rawText);
      if (!pt || pt.length < 2) continue;
      if (rawText.includes('【应答】')) continue;
      if (isFillInstruction(rawText) && !isResponseSlotHeading(rawText)) continue;

      let score = 0;
      if (pt === resp.normAnchor) score = 100;
      else if (pt.includes(resp.normAnchor) && resp.normAnchor.length >= 4) score = 80;
      else if (resp.normAnchor.includes(pt) && pt.length >= 4 && pt.length <= 80) score = 70;
      else if (
        resp.prefersResponseSlot &&
        isResponseSlotHeading(rawText) &&
        resp.normAnchor.includes(normalize(rawText.replace(/^#{0,3}/, '')))
      ) {
        score = 90;
      }

      if (score > 0 && isResponseSlotHeading(rawText)) score += 15;
      if (score > 0 && pt.length > 120) score -= 25;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestScore < 60) {
      unmatched.push(resp.anchor || resp.title);
      continue;
    }
    const block = buildResponseParagraphs(resp.title, resp.content);
    insertAfter.set(bestIdx, (insertAfter.get(bestIdx) || '') + block);
  }

  const paraClosePartIndex = new Map<number, number>();
  let paraCount = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '</w:p>' && i > 0) {
      const chunk = parts[i - 1];
      if (chunk.lastIndexOf('<w:p') >= 0) {
        paraClosePartIndex.set(paraCount, i);
        paraCount++;
      }
    }
  }

  for (const [paraIdx, block] of insertAfter) {
    const closeIdx = paraClosePartIndex.get(paraIdx);
    if (closeIdx === undefined) continue;
    parts[closeIdx] = parts[closeIdx] + block;
  }

  xml = parts.join('');
  zip.file('word/document.xml', xml);
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  return { buffer, inserted: insertAfter.size, unmatched };
}
