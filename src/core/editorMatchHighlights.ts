export interface KtcTextOffsetRange {
  start: number;
  end: number;
}

function mergeOverlappingRanges(ranges: readonly KtcTextOffsetRange[]): KtcTextOffsetRange[] {
  const ordered = [...ranges].sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: KtcTextOffsetRange[] = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (!previous || range.start >= previous.end) {
      merged.push({ ...range });
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
  }
  return merged;
}

/** Case-sensitive literal matches, matching the current search/replace engine. */
export function ktcFindLiteralHighlightOffsets(
  text: string,
  terms: readonly string[],
  limit = 2_000,
): KtcTextOffsetRange[] {
  if (!text || limit <= 0) return [];
  const normalized = [...new Set(terms.filter(Boolean))].sort((left, right) => right.length - left.length);
  const ranges: KtcTextOffsetRange[] = [];
  for (const term of normalized) {
    let from = 0;
    while (from <= text.length - term.length && ranges.length < limit) {
      const start = text.indexOf(term, from);
      if (start < 0) break;
      ranges.push({ start, end: start + term.length });
      from = start + Math.max(1, term.length);
    }
    if (ranges.length >= limit) break;
  }
  return mergeOverlappingRanges(ranges).slice(0, limit);
}

/** UTF-16 ranges suitable for VS Code TreeItemLabel.highlights. */
export function ktcFindNonAsciiHighlightOffsets(text: string): KtcTextOffsetRange[] {
  const ranges: KtcTextOffsetRange[] = [];
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const nonAscii = text.charCodeAt(index) > 0x7f;
    if (nonAscii && start < 0) start = index;
    if (!nonAscii && start >= 0) {
      ranges.push({ start, end: index });
      start = -1;
    }
  }
  if (start >= 0) ranges.push({ start, end: text.length });
  return ranges;
}

/**
 * Resolves issue columns to editor character ranges. In ASCII-only mode the
 * byte scanner can report columns inside a multi-byte character, so prefer
 * contiguous non-ASCII text instead of painting unrelated ASCII characters.
 */
export function ktcFindIssueLineHighlightOffsets(
  text: string,
  oneBasedColumns: readonly number[],
  preferNonAscii: boolean,
): KtcTextOffsetRange[] {
  if (preferNonAscii) {
    const nonAscii = ktcFindNonAsciiHighlightOffsets(text);
    if (nonAscii.length > 0) return nonAscii;
  }
  const ranges: KtcTextOffsetRange[] = [];
  const seen = new Set<number>();
  for (const column of oneBasedColumns) {
    const start = Math.max(0, Math.min(text.length, column - 1));
    if (start >= text.length || seen.has(start)) continue;
    seen.add(start);
    const codePoint = text.codePointAt(start);
    ranges.push({ start, end: Math.min(text.length, start + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1)) });
  }
  return ranges.sort((left, right) => left.start - right.start);
}
