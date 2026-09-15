import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KBAsset, KBChunk, Memory } from '../entities';
import { cosine } from '../common/vector';
import { LlmService } from '../llm/llm.service';

export interface KnowledgeHit {
  type: 'KB' | 'MEMORY';
  id: string;
  title: string;
  content: string;
  score: number;
}

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KBAsset)
    private readonly assetRepo: Repository<KBAsset>,
    @InjectRepository(KBChunk)
    private readonly chunkRepo: Repository<KBChunk>,
    @InjectRepository(Memory)
    private readonly memoryRepo: Repository<Memory>,
    private readonly llm: LlmService,
  ) {}

  async search(tenantId: string, query: string, topK = 8): Promise<KnowledgeHit[]> {
    const qVec = await this.llm.embed(query);
    const [chunks, memories] = await Promise.all([
      this.chunkRepo.find({ where: { tenantId } }),
      this.memoryRepo.find({ where: { tenantId, status: 'ACTIVE' } }),
    ]);
    const assetIds = new Set(
      (await this.assetRepo.find({ where: { tenantId, status: 'ACTIVE' } })).map((a) => a.id),
    );
    const hits: KnowledgeHit[] = [];
    const likeBoost = (content: string) =>
      query
        .split(/[\s,，。]+/)
        .filter(Boolean)
        .reduce((acc, w) => acc + (content.includes(w) ? 1 : 0), 0) * 0.05;

    for (const c of chunks) {
      if (!assetIds.has(c.assetId)) continue;
      const score = cosine(qVec, c.embedding) + likeBoost(c.content);
      hits.push({ type: 'KB', id: c.id, title: `知识库切片#${c.chunkNo}`, content: c.content, score });
    }
    for (const m of memories) {
      const score = cosine(qVec, m.embedding) * (0.5 + m.confidence * 0.5) + likeBoost(m.content);
      hits.push({ type: 'MEMORY', id: m.id, title: `${m.memType === 'SEMANTIC' ? '语义记忆' : '情景记忆'} v${m.version}`, content: m.content, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }

  splitChunks(content: string, size = 400): string[] {
    const clean = content.replace(/\r/g, '');
    const parts: string[] = [];
    let buf = '';
    for (const para of clean.split('\n')) {
      if (buf.length + para.length > size && buf) {
        parts.push(buf);
        buf = '';
      }
      buf += para + '\n';
    }
    if (buf.trim()) parts.push(buf);
    return parts.length ? parts : [clean];
  }
}
