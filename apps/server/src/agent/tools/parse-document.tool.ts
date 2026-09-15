import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { Clause, Project, TenderDoc, OutlineNode } from '../../entities';
import { nextId } from '../../common/snowflake';
import { AgentTool, ToolContext, ToolResult } from './tool.interface';

/** 通用：行首【…】/ #【…】 视为结构化小标题（不绑定特定采购平台） */
const MARKER_HEADING_RE = /^#{0,3}\s*【[^】]{1,80}】\s*$/;
const MARKER_INLINE_RE = /#{0,3}\s*【[^】]{1,80}】/g;

@Injectable()
export class ParseDocumentTool implements AgentTool {
  readonly name = 'parse_document' as const;

  async run(ctx: ToolContext): Promise<ToolResult> {
    const docRepo = ctx.dataSource.getRepository(TenderDoc);
    const clauseRepo = ctx.dataSource.getRepository(Clause);
    const projectRepo = ctx.dataSource.getRepository(Project);

    const doc = await docRepo.findOne({
      where: { tenantId: ctx.tenantId, projectId: ctx.projectId },
      order: { createdAt: 'DESC' },
    });
    if (!doc) throw new Error('请先上传招标文件');

    const existing = await clauseRepo.count({ where: { docId: doc.id } });
    const outlineHasBracketHeadings = (doc.outline ?? []).some((o) =>
      /【[^】]+】/.test(`${o.title ?? ''}${o.path ?? ''}`),
    );
    let shouldSkip = existing > 0 && doc.parseStatus === 'PARSED';
    if (shouldSkip && !outlineHasBracketHeadings) {
      // 正文里已有【】小标题但大纲未拆出时，重解析一次以改善结构线索
      const sample = await clauseRepo.find({ where: { docId: doc.id }, take: 80 });
      const embeddedMarkers = sample.some(
        (c) =>
          /#{0,3}\s*【[^】]+】/.test(c.content || '') &&
          !/#{0,3}\s*【/.test(c.sectionPath || ''),
      );
      if (embeddedMarkers) shouldSkip = false;
    }
    if (shouldSkip) {
      return { output: { skipped: true, clauseCount: existing, outline: doc.outline } };
    }

    doc.parseStatus = 'PARSING';
    await docRepo.save(doc);

    const text = await this.extractText(doc.fileUri, doc.fileName);
    const { outline, clauses } = this.splitOutlineAndClauses(text);

    await clauseRepo.delete({ docId: doc.id });
    await clauseRepo.save(
      clauses.map((c) => ({
        id: nextId(),
        tenantId: ctx.tenantId,
        docId: doc.id,
        sectionPath: c.sectionPath,
        clauseNo: c.clauseNo,
        content: c.content,
        type: 'CLAUSE',
      })),
    );

    doc.outline = outline;
    doc.parseStatus = 'PARSED';
    await docRepo.save(doc);
    await projectRepo.update({ id: ctx.projectId }, { stage: 'PARSED' });

    return { output: { outlineCount: outline.length, clauseCount: clauses.length, outline } };
  }

  private async extractText(fileUri: string, fileName: string): Promise<string> {
    const ext = extname(fileName).toLowerCase();
    if (ext === '.pdf') {
      const mod: unknown = await import('pdf-parse');
      const pdfParse = (mod as { default?: unknown }).default ?? mod;
      const buf = await readFile(fileUri);
      const result = await (pdfParse as (b: Buffer) => Promise<{ text: string }>)(buf);
      return result.text;
    }
    if (ext === '.docx' || ext === '.doc') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: fileUri });
      return result.value;
    }
    return readFile(fileUri, 'utf8');
  }

  private splitOutlineAndClauses(text: string): {
    outline: OutlineNode[];
    clauses: { sectionPath: string; clauseNo: string | null; content: string }[];
  } {
    const chapterRe = /^第[一二三四五六七八九十百0-9]+[章节篇部分]\s*[^\n]{0,60}$/;
    const cnHeadingRe = /^[一二三四五六七八九十]+、\s*[^\n]{1,60}$/;
    const numHeadingRe = /^\d+(?:\.\d+){0,3}[、.\s]\s*[^\n]{1,40}$/;
    const endsWithPunctuation = /[。；;，,：:！!？?]$/;
    const isHeading = (line: string): boolean => {
      if (MARKER_HEADING_RE.test(line)) return true;
      if (endsWithPunctuation.test(line)) return false;
      return chapterRe.test(line) || cnHeadingRe.test(line) || numHeadingRe.test(line);
    };

    // 将粘在同一行中间的 ##【…】 拆成独立行，便于识别「投标响应」占位
    const normalized = text.replace(MARKER_INLINE_RE, (m) => `\n${m.trim()}\n`);
    const lines = normalized.split(/\r?\n/).map((l) => l.trim());
    const outline: OutlineNode[] = [];
    const clauses: { sectionPath: string; clauseNo: string | null; content: string }[] = [];
    let currentPath = '未分组';
    let clauseNo = 0;
    let buf: string[] = [];

    const flush = () => {
      const content = buf.join('\n').trim();
      if (content) {
        clauseNo++;
        clauses.push({
          sectionPath: currentPath,
          clauseNo: String(clauseNo),
          content,
        });
      }
      buf = [];
    };

    for (const line of lines) {
      if (!line) continue;
      if (line.length <= 100 && isHeading(line)) {
        flush();
        const no = String(outline.length + 1);
        outline.push({ no, title: line, path: line });
        currentPath = line;
      } else {
        buf.push(line);
        if (buf.join('\n').length > 800) flush();
      }
    }
    flush();

    if (outline.length === 0) {
      outline.push({ no: '1', title: '招标文件全文', path: '招标文件全文' });
    }
    return { outline, clauses };
  }
}
