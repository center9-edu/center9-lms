/** "Lập trình" → "lap trinh": lowercase, no accents, đ as d, so a search can be typed with or without them. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
}

/** True when every word of `query` appears somewhere in `fields`; a blank query matches everything. */
export function matchesSearch(fields: (string | null)[], query: string): boolean {
  const haystack = fold(fields.filter(Boolean).join(' '));
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
