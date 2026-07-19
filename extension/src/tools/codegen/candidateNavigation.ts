const CODEGEN_MARKER_LINE = /^.*(?:START|END) KEVIN CAA WIZARD SECTION.*$/gmu;

export interface KtcCodegenCandidateNavigation {
  readonly firstOffset?: number;
  readonly highlightTerms: readonly string[];
}

/** 提取候选源码中的完整控制符行；Host 只负责定位/高亮，不建立第二份 marker 解析器。 */
export function ktcCodegenCandidateNavigation(text: string): KtcCodegenCandidateNavigation {
  const terms: string[] = [];
  let firstOffset: number | undefined;
  for (const match of text.matchAll(CODEGEN_MARKER_LINE)) {
    const term = match[0].trim();
    if (!term) continue;
    if (firstOffset === undefined) firstOffset = match.index + match[0].indexOf(term);
    if (!terms.includes(term)) terms.push(term);
  }
  return { firstOffset, highlightTerms: terms };
}
