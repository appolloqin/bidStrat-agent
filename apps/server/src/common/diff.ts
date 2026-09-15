import { FeedbackAction } from '@bidstrat/shared';

function tokens(s: string): Set<string> {
  const t = new Set<string>();
  const clean = (s || '').replace(/\s+/g, '');
  for (let i = 0; i < clean.length; i++) {
    t.add(clean.slice(i, i + 2));
  }
  return t;
}

export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((x) => {
    if (tb.has(x)) inter++;
  });
  return (2 * inter) / (ta.size + tb.size);
}

export function classifyFeedbackAction(before: string, after: string): FeedbackAction {
  if ((before || '') === (after || '')) return 'ACCEPTED';
  const sim = textSimilarity(before, after);
  if (sim >= 0.85) return 'MINOR_EDIT';
  if (sim >= 0.4) return 'MAJOR_EDIT';
  return 'REWRITE';
}
