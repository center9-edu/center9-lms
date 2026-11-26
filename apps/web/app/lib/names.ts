/** "Trần Thị Lan" → "Lan": the given name comes last in Vietnamese, and it is what people are called by. */
export function givenName(fullName: string): string {
  return fullName.normalize('NFC').trim().split(/\s+/).pop() ?? '';
}

/** "Trần Thị Lan" → "L". */
export function initialOf(fullName: string): string {
  const [first = '?'] = givenName(fullName);
  return first.toLocaleUpperCase('vi');
}

/** A stable pick among `count` colors, so a person keeps the same avatar color everywhere. */
export function colorIndex(name: string, count: number): number {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash % count;
}
