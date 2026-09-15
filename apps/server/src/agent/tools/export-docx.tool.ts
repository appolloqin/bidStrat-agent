import { Injectable, Logger } from '@nestjs/common';
import { writeFile, mkdir, access } from 'fs/promises';
import { join, resolve, extname } from 'path';
import {
  AlignmentType,
  convertInchesToTwip,
  Document,
  Packer,
  Paragraph,
  TextRun,
  IRunOptions,
} from 'docx';
import { BidSection, Clause, Project, TenderDoc } from '../../entities';
import { env } from '../../config/env';
import { sanitizeLlmOutput } from '../../common/llm-parsing';
import { annotateDocxWithResponses } from '../../common/annotate-docx';
import { AgentTool, ToolContext, ToolResult } from './tool.interface';

type DocBlock = Paragraph;

const FONT_BODY = { ascii: 'Times New Roman', eastAsia: '仿宋', hAnsi: 'Times New Roman' };
const FONT_HEADING = { ascii: 'SimHei', eastAsia: '黑体', hAnsi: 'SimHei' };
const FONT_TITLE = { ascii: 'SimHei', eastAsia: '黑体', hAnsi: 'SimHei' };
const SIZE_BODY = 24;
const SIZE_H1 = 32;
const SIZE_TITLE = 36;

@Injectable()
export class ExportDocxTool implements AgentTool<{ annotateOnSource?: boolean }> {
  readonly name = 'export_docx' as const;
  private readonly logger = new Logger(ExportDocxTool.name);

  async run(ctx: ToolContext, input?: { annotateOnSource?: boolean }): Promise<ToolResult> {
    const annotateOnSource = input?.annotateOnSource !== false;
    const projectRepo = ctx.dataSource.getRepository(Project);
    const sectionRepo = ctx.dataSource.getRepository(BidSection);
    const tenderRepo = ctx.dataSource.getRepository(TenderDoc);
    const clauseRepo = ctx.dataSource.getRepository(Clause);

    const project = await projectRepo.findOne({ where: { id: ctx.projectId } });
    if (!project) throw new Error('项目不存在');
    const sections = await sectionRepo.find({
      where: { projectId: ctx.projectId },
      order: { outlineNo: 'ASC' },
    });
    if (sections.length === 0) throw new Error('尚无可导出的应答内容');

    for (const s of sections) {
      const clean = sanitizeLlmOutput(s.content ?? '');
      if (clean !== (s.content ?? '')) {
        s.content = clean;
        await sectionRepo.save(s);
      }
    }

    const tender = await tenderRepo.findOne({
      where: { projectId: ctx.projectId },
      order: { createdAt: 'DESC' },
    });

    const dir = resolve(env.uploadDir, 'exports');
    await mkdir(dir, { recursive: true });
    const fileName = `${ctx.projectId}-${Date.now()}.docx`;
    const absFile = join(dir, fileName);

    let mode: 'annotate_original' | 'interleave_clauses' | 'greenfield' = 'greenfield';
    let inserted = 0;
    let unmatched: string[] = [];

    // 勾选「在源文件上修改」且原文为 DOCX 时：在原件对应位置插入应答
    if (annotateOnSource && tender && this.isDocx(tender)) {
      const srcAbs = resolve(process.cwd(), tender.fileUri);
      try {
        await access(srcAbs);
        const result = await annotateDocxWithResponses(
          srcAbs,
          sections.map((s) => ({
            anchor: this.resolveAnchor(s),
            title: s.title,
            content: sanitizeLlmOutput(s.content ?? ''),
          })),
        );
        let buffer = result.buffer;
        if (result.unmatched.length) {
          this.logger.warn(`原文未匹配锚点 ${result.unmatched.length} 处，将追加到文末：${result.unmatched.join('；')}`);
          buffer = await this.appendUnmatchedToDocx(
            buffer,
            sections.filter((s) => result.unmatched.includes(this.resolveAnchor(s))),
          );
        }
        await writeFile(absFile, buffer);
        mode = 'annotate_original';
        inserted = result.inserted;
        unmatched = result.unmatched;
      } catch (e) {
        this.logger.warn(`原文标注导出失败，回退新建文档：${e instanceof Error ? e.message : e}`);
      }
    }

    // 未勾选、或非 DOCX、或标注失败：新建独立应答文档
    if (mode === 'greenfield') {
      if (annotateOnSource && tender) {
        // 想改源文件但原文不是 DOCX：按条款交织新建（尽量保留原文顺序）
        const clauses = await clauseRepo.find({ where: { docId: tender.id }, order: { createdAt: 'ASC' } });
        if (clauses.length) {
          const buffer = await this.buildInterleavedDocx(project, clauses, sections);
          await writeFile(absFile, buffer);
          mode = 'interleave_clauses';
        } else {
          const buffer = await this.buildGreenfieldDocx(project, sections);
          await writeFile(absFile, buffer);
        }
      } else {
        const buffer = await this.buildGreenfieldDocx(project, sections);
        await writeFile(absFile, buffer);
      }
    }

    await projectRepo.update({ id: ctx.projectId }, { exportFileUri: absFile });
    const modeLabel =
      mode === 'annotate_original'
        ? `已在源文件上插入应答（命中 ${inserted} 处${unmatched.length ? `，未匹配 ${unmatched.length} 处已文末追加` : ''}）`
        : mode === 'interleave_clauses'
          ? '已按招标条款顺序新建交织应答稿（源文件非 DOCX 或无法直接改原件）'
          : annotateOnSource
            ? '已新建独立应答文档'
            : '已按选项新建独立应答文档（未修改源文件）';
    ctx.emit('log', modeLabel, { mode, inserted, unmatched, annotateOnSource });
    return {
      output: {
        fileUri: absFile,
        fileName,
        sectionCount: sections.length,
        mode,
        inserted,
        unmatched,
        annotateOnSource,
      },
    };
  }

  private isDocx(tender: TenderDoc): boolean {
    const ext = extname(tender.fileName || tender.fileUri || '').toLowerCase();
    return ext === '.docx' || (tender.mimeType || '').includes('wordprocessingml');
  }

  /** 从章节标题还原招标锚点（兼容旧数据未写 tenderAnchor） */
  private resolveAnchor(s: BidSection): string {
    if (s.tenderAnchor?.trim()) return s.tenderAnchor.trim();
    const m1 = s.title.match(/对「(.+?)」的应答/);
    if (m1?.[1]) return m1[1];
    const m2 = s.title.match(/对招标【(.+?)】的应答/);
    if (m2?.[1]) return m2[1];
    return s.title;
  }

  private async appendUnmatchedToDocx(buffer: Buffer, sections: BidSection[]): Promise<Buffer> {
    if (!sections.length) return buffer;
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return buffer;
    let xml = await docFile.async('string');
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let extra = `<w:p><w:r><w:rPr><w:b/><w:color w:val="C00000"/></w:rPr><w:t>【未定位到原文锚点的应答（文末汇总）】</w:t></w:r></w:p>`;
    for (const s of sections) {
      extra += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(`【应答】${s.title}`)}</w:t></w:r></w:p>`;
      for (const line of sanitizeLlmOutput(s.content ?? '').split(/\r?\n/)) {
        if (!line.trim()) continue;
        extra += `<w:p><w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`;
      }
    }
    xml = xml.replace(/<\/w:body>/, `${extra}</w:body>`);
    zip.file('word/document.xml', xml);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  /** 按条款顺序：先原文，后该位置应答 */
  private async buildInterleavedDocx(
    project: Project,
    clauses: Clause[],
    sections: BidSection[],
  ): Promise<Buffer> {
    const byPath = new Map<string, BidSection[]>();
    for (const s of sections) {
      const key = (s.tenderAnchor || s.title || '').trim();
      if (!key) continue;
      const list = byPath.get(key) ?? [];
      list.push(s);
      byPath.set(key, list);
    }
    const used = new Set<string>();
    const children: DocBlock[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [this.textRun(`${project.tenderName}（点对点应答稿）`, { font: FONT_TITLE, size: SIZE_TITLE, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 320 },
        children: [
          this.textRun('说明：以下按招标文件条款顺序，先列原文要点，再附【应答】。', {
            font: FONT_BODY,
            size: SIZE_BODY,
          }),
        ],
      }),
    ];

    let lastPath = '';
    for (const c of clauses) {
      const path = (c.sectionPath || '').trim();
      if (path && path !== lastPath) {
        children.push(
          new Paragraph({
            spacing: { before: 280, after: 120 },
            children: [this.textRun(path, { font: FONT_HEADING, size: SIZE_H1, bold: true })],
          }),
        );
        lastPath = path;
      }
      const snippet = (c.content || '').trim().slice(0, 800);
      if (snippet) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [this.textRun(`【原文】${snippet}${(c.content || '').length > 800 ? '…' : ''}`)],
          }),
        );
      }
      const matched = path ? byPath.get(path) : undefined;
      if (matched?.length) {
        for (const s of matched) {
          used.add(s.id);
          children.push(
            new Paragraph({
              spacing: { before: 120, after: 60 },
              children: [this.textRun(`【应答】${s.title}`, { bold: true, font: FONT_HEADING, size: 28 })],
            }),
          );
          for (const line of sanitizeLlmOutput(s.content ?? '').split(/\r?\n/)) {
            if (!line.trim()) continue;
            children.push(new Paragraph({ spacing: { after: 60, line: 360 }, children: [this.textRun(line)] }));
          }
        }
      }
    }

    for (const s of sections) {
      if (used.has(s.id)) continue;
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 60 },
          children: [this.textRun(`【应答】${s.title}`, { bold: true, font: FONT_HEADING, size: 28 })],
        }),
      );
      for (const line of sanitizeLlmOutput(s.content ?? '').split(/\r?\n/)) {
        if (!line.trim()) continue;
        children.push(new Paragraph({ spacing: { after: 60, line: 360 }, children: [this.textRun(line)] }));
      }
    }

    const doc = new Document({
      styles: { default: { document: { run: { font: '仿宋', size: SIZE_BODY } } } },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1.1),
                right: convertInchesToTwip(1.1),
              },
            },
          },
          children,
        },
      ],
    });
    return Packer.toBuffer(doc);
  }

  private async buildGreenfieldDocx(project: Project, sections: BidSection[]): Promise<Buffer> {
    const children: DocBlock[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [this.textRun(project.tenderName, { font: FONT_TITLE, size: SIZE_TITLE, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 320 },
        children: [this.textRun(`项目编号：${project.tenderNo ?? '-'}`, { font: FONT_BODY, size: SIZE_BODY })],
      }),
    ];
    for (const s of sections) {
      children.push(
        new Paragraph({
          spacing: { before: 360, after: 160 },
          children: [this.textRun(`${s.outlineNo} ${s.title}`, { font: FONT_HEADING, size: SIZE_H1, bold: true })],
        }),
      );
      for (const line of sanitizeLlmOutput(s.content ?? '').split(/\r?\n/)) {
        if (!line.trim()) continue;
        children.push(new Paragraph({ spacing: { after: 80, line: 360 }, children: [this.textRun(line)] }));
      }
    }
    const doc = new Document({
      styles: { default: { document: { run: { font: '仿宋', size: SIZE_BODY } } } },
      sections: [{ properties: {}, children }],
    });
    return Packer.toBuffer(doc);
  }

  private textRun(text: string, opts: IRunOptions = {}): TextRun {
    return new TextRun({
      text,
      font: FONT_BODY,
      size: SIZE_BODY,
      ...opts,
    });
  }
}
