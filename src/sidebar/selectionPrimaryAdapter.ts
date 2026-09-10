import type { ToolUiState, WebviewInboundMessage } from "../tools/types.js";
import type { KtcSelectionPrimaryAction, KtcSelectionPrimaryModel, KtcSelectionToolId, KtcSelectionUuidStrategy } from "../ui/KtcSelectionPrimary.js";

/** Formal data projection only; the existing tools retain all plans and write authority. */
export function ktcProjectSelectionPrimary(options: {
  readonly toolId: KtcSelectionToolId;
  readonly directory: string;
  readonly state: ToolUiState;
  readonly uuidStrategy?: KtcSelectionUuidStrategy;
}): KtcSelectionPrimaryModel {
  const { toolId, directory, state } = options;
  const running = state.status === "running";
  const uuidStrategy = options.uuidStrategy ?? "map_per_value";
  // Older snapshots without an explicit strategy used the same-value default.
  // Never mutate a Host-owned plan just to preview a different UI policy.
  const strategyChanged = toolId === "uuidReplace" && Array.isArray(state.uuidResults)
    && uuidStrategy !== (state.uuidStrategy ?? "map_per_value");
  return {
    toolId, directory, running, scanEnabled: Boolean(directory.trim()),
    uuidStrategy,
    message: strategyChanged ? `${state.message ? `${state.message} ` : ""}生成策略已改变，请重新扫描；上次结果仅供查看。` : state.message || (toolId === "reorderMembers"
      ? "扫描当前工作目录中的 C++ 头文件和源文件；写入前会再次确认文件没有变化。"
      : "点击“扫描 UUID”生成固定映射。"),
    ...(toolId === "reorderMembers" ? { reorder: {
      presentation: "results" as const, status: state.status, message: "", scanned: state.scanned,
      reorderResults: state.reorderResults, reorderRevision: state.reorderRevision, reorderSelectedUris: state.reorderSelectedUris,
      capabilities: { scan: false, addToWorkset: false, selection: true, open: true, preview: true, apply: true, cancel: true, gitDiff: true, revert: true },
    } } : { uuid: {
      presentation: "files" as const, running, files: state.uuidResults?.filter(row => row.state !== "cancelled"),
      selectedIds: strategyChanged ? [] : state.uuidSelectedUris ?? [],
      emptyMessage: Array.isArray(state.uuidResults) ? "没有 UUID 候选。" : "点击“扫描 UUID”生成固定映射。",
      capabilities: { selection: !strategyChanged, open: true, apply: !strategyChanged, cancel: true, gitDiff: true },
    } }),
  };
}

/** Strategy changes are local UI policy; the Host receives it only with an explicit scan. */
export function ktcSelectionPrimaryMessage(detail: KtcSelectionPrimaryAction): WebviewInboundMessage | undefined {
  if (detail.toolId !== "reorderMembers" && detail.toolId !== "uuidReplace") return undefined;
  if (detail.kind === "setStrategy") return undefined;
  if (detail.kind === "scan") return { type: "run", toolId: detail.toolId, action: "scan", ...(detail.toolId === "uuidReplace" ? { uuidStrategy: detail.uuidStrategy ?? "map_per_value" } : {}) };
  if (detail.kind === "selection") return detail.toolId === "reorderMembers"
    ? { type: "reorderSelection", toolId: detail.toolId, uris: [...detail.uris] }
    : { type: "uuidSelection", toolId: detail.toolId, uris: [...detail.uris] };
  if (detail.kind !== "action") return undefined;
  if (detail.toolId === "reorderMembers") return { type: "reorderAction", toolId: detail.toolId, action: detail.action, uris: [...detail.uris] };
  if (detail.action === "preview" || detail.action === "revert") return undefined;
  return { type: "uuidAction", toolId: detail.toolId, action: detail.action, uris: [...detail.uris] };
}
