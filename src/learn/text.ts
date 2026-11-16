const GLYPH: Record<string, string> = {
  ls: 'LS',
  rt: 'RT',
  lt: 'LT',
  a: 'A',
  b: 'B',
  rb: 'RB',
  lb: 'LB',
  dpad: 'D-pad',
};

/** Coach copy with Xbox glyphs. The source text is ours, not player input. */
export function coachHtml(text: string): string {
  const safe = text.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));
  return safe.replace(/\{(ls|rt|lt|a|b|rb|lb|dpad)\}/g, (_match, key: string) => {
    return `<span class="glyph ${key}">${GLYPH[key]}</span>`;
  });
}

export function starText(n: number): string {
  const full = Math.max(0, Math.min(3, Math.round(n)));
  return '★'.repeat(full) + '☆'.repeat(3 - full);
}
