export function hashEmbed(text: string, dim = 128): number[] {
  const v = new Array<number>(dim).fill(0);
  const s = text || '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    v[(c * 31 + i * 7) % dim] += 1;
    if (i + 1 < s.length) {
      v[((c << 5) + s.charCodeAt(i + 1) * 3 + i) % dim] += 0.7;
    }
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}
