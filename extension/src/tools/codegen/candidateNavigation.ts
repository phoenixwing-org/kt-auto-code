const CODEGEN_MARKER_LINE = /^.*(?:START|END) KEVIN CAA WIZARD SECTION.*$/gmu;

export interface KtcCodegenCandidateNavigation {
  readonly firstOffset?: number;
  readonly highlightTerms: readonly string[];
}

export interface KtcCodegenCandidatePreviewSession {
  readonly uri: string;
  /** VS Code 全局关闭 Preview 时，由 Auto Code 管理刚打开的普通标签替换。 */
  readonly managedRegularTab: boolean;
}

export interface KtcCodegenCandidateTabState {
  readonly uri: string;
  readonly dirty: boolean;
  readonly pinned: boolean;
  readonly preview: boolean;
}

/** 只关闭 Auto Code 上一次建立、未编辑且未固定的候选标签。 */
export function ktcShouldReplaceCodegenCandidateTab(
  previous: KtcCodegenCandidatePreviewSession | undefined,
  nextUri: string,
  tab: KtcCodegenCandidateTabState | undefined,
): boolean {
  if (!previous || previous.uri === nextUri || !tab || tab.uri !== previous.uri) return false;
  if (tab.dirty || tab.pinned) return false;
  return tab.preview || previous.managedRegularTab;
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
