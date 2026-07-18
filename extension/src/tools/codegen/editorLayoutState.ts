export const KTC_CODEGEN_EDITOR_LAYOUT_STATE_KEY = "ktAutoCode.codegen.editorLayout.v1";

export const KTC_CODEGEN_CONTROL_SPLIT_MIN = 20;
export const KTC_CODEGEN_CONTROL_SPLIT_MAX = 75;

export interface KtcCodegenEditorLayoutState {
  readonly controlSplitPercent: number;
}

export const KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT: KtcCodegenEditorLayoutState = Object.freeze({
  controlSplitPercent: 42,
});

export function ktcClampCodegenControlSplitPercent(value: number): number {
  const candidate = Number.isFinite(value)
    ? value
    : KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT.controlSplitPercent;
  return Math.round(Math.min(
    KTC_CODEGEN_CONTROL_SPLIT_MAX,
    Math.max(KTC_CODEGEN_CONTROL_SPLIT_MIN, candidate),
  ));
}

/** UI 布局只接受有限数值；损坏或旧版工作区状态不得影响业务 View。 */
export function ktcNormalizeCodegenEditorLayout(
  value: unknown,
): KtcCodegenEditorLayoutState {
  const source = value && typeof value === "object"
    ? value as Partial<KtcCodegenEditorLayoutState>
    : {};
  const candidate = typeof source.controlSplitPercent === "number"
    ? source.controlSplitPercent
    : KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT.controlSplitPercent;
  return {
    controlSplitPercent: ktcClampCodegenControlSplitPercent(candidate),
  };
}
