import type { ToolOptionsState, ToolUiState, WebviewInboundMessage } from "../tools/types.js";
import type {
  KtcTextRepairKind,
  KtcTextRepairPrimaryAction,
  KtcTextRepairPrimaryModel,
  KtcTextRepairRow,
  KtcTextRepairScopeKey,
} from "../ui/KtcTextRepairPrimary.js";

export interface KtcTextRepairPrimaryInput {
  readonly toolId: KtcTextRepairKind;
  readonly directory: string;
  readonly toolState?: ToolUiState;
  readonly options?: ToolOptionsState;
  readonly scope?: Partial<Readonly<Record<KtcTextRepairScopeKey, boolean>>>;
  /** Existing per-Webview UI state; never sent as project configuration. */
  readonly showDetails?: boolean;
  readonly showEncDetails?: boolean;
}

/** Project Host snapshots only; no scans, encoding detection, configuration reads or fixtures. */
export function ktcCreateTextRepairPrimaryModel(input: KtcTextRepairPrimaryInput): KtcTextRepairPrimaryModel {
  const state = input.toolState ?? { status: "idle" };
  const options = input.options ?? {};
  const header = input.toolId === "headerAscii";
  const busy = state.status === "running";
  const preserveGbk = options.preserveGbk ?? false;
  const rows: KtcTextRepairRow[] = header
    ? (state.results ?? []).map(row => ({
        id: row.fullPath,
        fullPath: row.fullPath,
        relativePath: row.relativePath || row.file,
        line: row.topLine,
        badge: `L${row.topLine} ×${row.issueCount}`,
        tone: "error",
        highlightNonAscii: true,
        issues: row.issues.map(issue => ({
          line: issue.line, column: issue.column, from: issue.fromLabel, to: issue.toLabel,
        })),
      }))
    : (state.encodingResults ?? []).map(row => ({
        id: row.fullPath,
        fullPath: row.fullPath,
        relativePath: row.relativePath || row.file,
        badge: row.suggestedAction === "—" ? "✓" : row.suggestedAction,
        ...(row.status === "ok" ? { tone: "success" as const }
          : row.status === "unsupported" ? {} : { tone: "error" as const }),
        description: `${row.detected} → ${row.expected}`,
        ...(row.detail ? { detail: row.detail } : {}),
      }));
  const targetLabel = (target: "ascii" | "utf8" | "gbk") => target === "ascii" ? "ASCII" : target === "gbk" ? "GBK" : "UTF-8";
  const overrides = ([
    ["头文件", options.encodingHeaderTarget], ["源文件", options.encodingSourceTarget], ["Markdown", options.encodingMarkdownTarget],
  ] as const).flatMap(([label, value]) => value && value !== "inherit" ? [`${label} ${targetLabel(value)}`] : []);
  const summary: string[] = [];
  if (typeof state.scanned === "number") summary.push(`已预检 ${state.scanned} 个文件`);
  if (typeof state.issueFiles === "number") summary.push(`${state.issueFiles} 个${header ? "问题文件" : "不符合目标"}`);
  if (typeof state.fixedFiles === "number") summary.push(`已${header ? "修复" : "转换"} ${state.fixedFiles} 个文件`);
  let emptyMessage = header
    ? preserveGbk ? "点击「预检」检查弯引号等问题字节。" : "点击「预检」检查头文件中的非 ASCII 内容。"
    : "点击「预检」检查文件整体编码。";
  if (state.status === "done" && state.issueFiles === 0) {
    emptyMessage = header
      ? preserveGbk ? "未发现弯引号等问题字节。" : "未发现非 ASCII 或问题字节。"
      : "所有文件均符合当前项目编码目标。";
  } else if (state.status === "running" || state.status === "error") emptyMessage = "";
  return {
    kind: input.toolId,
    directory: input.directory,
    busy,
    // Legacy Primary allows direct repair/conversion; Host owns directory/scope validation and confirmation.
    scanEnabled: true,
    writeEnabled: true,
    ...(busy ? { disabledReason: state.message || "正在处理，请稍候。" } : {}),
    scope: {
      includeHeaders: input.scope?.includeHeaders ?? true,
      includeSource: input.scope?.includeSource ?? true,
      includeMarkdown: !header && (input.scope?.includeMarkdown ?? true),
    },
    preserveGbk,
    stripBom: options.stripBom ?? false,
    showDetails: header ? input.showDetails ?? false : input.showEncDetails ?? false,
    targetEncoding: options.encodingDefaultTarget === "gbk" ? "gbk" : "utf8",
    targetSummary: overrides.length ? `项目覆盖：${overrides.join(" · ")}` : "头文件、源文件和 Markdown 均继承默认目标。",
    status: state.message ?? "",
    ...(state.status === "error" ? { statusTone: "error" as const } : {}),
    summary: summary.join(" · "),
    emptyMessage,
    rows,
  };
}

/** Adapt to existing Host messages. showDetails stays in the caller's original local UI state. */
export function ktcTextRepairPrimaryActionToMessage(
  model: KtcTextRepairPrimaryModel,
  action: KtcTextRepairPrimaryAction,
): WebviewInboundMessage | undefined {
  if (model.busy) return undefined;
  const toolId = model.kind;
  if (action.action === "scan") return model.scanEnabled ? { type: "run", toolId, action: "scan" } : undefined;
  if (action.action === "fix" || action.action === "convert") {
    if (!model.writeEnabled || action.action !== (toolId === "headerAscii" ? "fix" : "convert")) return undefined;
    return { type: "run", toolId, action: action.action };
  }
  if (action.action === "settings") return toolId === "encodingFix" ? { type: "openEncodingSettings", toolId } : undefined;
  if (action.action === "setTarget") return toolId === "encodingFix" ? { type: "setEncodingDefaultTarget", toolId, target: action.value } : undefined;
  if (action.action === "setScope") {
    if (toolId === "headerAscii" && action.key === "includeMarkdown") return undefined;
    return { type: "setOption", toolId: "scope", key: action.key, value: action.value };
  }
  if (action.action === "setOption") {
    if (action.key === "showDetails" || toolId !== "headerAscii") return undefined;
    return { type: "setOption", toolId, key: action.key, value: action.value };
  }
  if (action.action === "open") {
    const row = model.rows.find(item => item.id === action.rowId);
    if (!row) return undefined;
    if (toolId === "encodingFix") return { type: "openEncodingFile", toolId, file: row.fullPath };
    const line = action.line ?? row.line ?? 1;
    if (!Number.isInteger(line) || line < 1) return undefined;
    // The existing Host resolves its full byte/kind/context issue cache by this exact file path for highlighting.
    return { type: "openIssue", toolId, file: row.fullPath, line };
  }
  return undefined;
}
