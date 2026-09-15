/**
 * 标书正文硬性缺陷检测（不依赖 LLM）。
 * 自评 / 合规必须先跑这类规则，否则英文思考、截断、推诿表述会被「要点覆盖」分数掩盖。
 */

export interface ContentDefect {
  code: string;
  message: string;
  /** 建议扣到不超过该分（自评硬门） */
  maxScore: number;
}

const EN_META =
  /\b(Let me |I (should|think|need|will|used|have|did|want)|Wait[,.]|Actually[,.]|The user |Looking (more )?carefully|One more thing|I think this is|Let me finalize|Let me revise)\b/i;

export function detectContentDefects(raw: string): ContentDefect[] {
  const text = raw || '';
  const defects: ContentDefect[] = [];

  if (!text.trim()) {
    defects.push({ code: 'EMPTY', message: '章节正文为空', maxScore: 0 });
    return defects;
  }

  if (/<think>|<\/think>|<redacted_reasoning>/i.test(text)) {
    defects.push({
      code: 'THINK_LEAK',
      message: '正文含模型思考标记（<think> 等），不可作为正式标书交付',
      maxScore: 20,
    });
  }

  if (/<memory>|<\/memory>|\{"memories"\s*:/i.test(text)) {
    defects.push({
      code: 'MEMORY_LEAK',
      message: '正文含记忆/工作流元数据块（<memory> 或 memories JSON），不可作为正式标书交付',
      maxScore: 15,
    });
  }

  if (EN_META.test(text)) {
    defects.push({
      code: 'EN_META',
      message: '正文含英文元推理/自检口述（如 Let me / I think / The user），非标书用语',
      maxScore: 25,
    });
  }

  // 英文字符占比过高（排除少量英文专有名词）
  const letters = text.replace(/\s/g, '');
  if (letters.length >= 200) {
    const en = (letters.match(/[A-Za-z]/g) || []).length;
    const zh = (letters.match(/[\u4e00-\u9fff]/g) || []).length;
    if (en > 80 && en / Math.max(zh + en, 1) > 0.25) {
      defects.push({
        code: 'EN_RATIO',
        message: `英文字符占比过高（约 ${Math.round((100 * en) / (zh + en))}%），疑似思考过程泄漏`,
        maxScore: 30,
      });
    }
  }

  if (/详见附件|见附件|稍后补充|内容待补|此处省略|同上略/.test(text)) {
    defects.push({
      code: 'DEFERRAL',
      message: '存在「详见附件/待补/省略」等推诿表述，评标易被认定为未实质响应',
      maxScore: 55,
    });
  }

  // 明显半截截断：以连词/介词/顿号等收尾
  const trimmed = text.trim();
  if (trimmed.length > 80 && /[的地得与及和或在于被把将从对按]$/.test(trimmed.replace(/\s+$/u, ''))) {
    defects.push({
      code: 'TRUNCATED',
      message: '正文疑似中途截断（以未完成句式收尾）',
      maxScore: 35,
    });
  }

  return defects;
}

/** 硬缺陷决定的自评上限；无缺陷时返回 null 表示不干预 */
export function hardScoreCap(defects: ContentDefect[]): number | null {
  if (!defects.length) return null;
  return Math.min(...defects.map((d) => d.maxScore));
}
