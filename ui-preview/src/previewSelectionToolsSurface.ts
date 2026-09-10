import {
  pnwApplyUuidReplacementPlan,
  pnwPlanUuidReplacements,
  pnwReorderCppText,
  pnwReorderHeaderText,
  type PnwUuidReplacementPlan,
} from "@phoenix-wing/code-core";
import { pnwCodeProjectUuidFiles, pnwCodeSelectUuidFileUris } from "@phoenix-wing/code-core/ui/model";
import type { KtcReorderMembersPanelRow } from "../../src/sidebar/reorderMembersPanelState.js";
import type { KtcUuidResultsPanelModel } from "../../src/sidebar/uuidResultsPanel.js";
import { KTC_SELECTION_PRIMARY_ACTION, ktcDefineSelectionPrimary, type KtcSelectionPrimaryAction } from "../../src/ui/KtcSelectionPrimary.js";

export interface PreviewSelectionToolsOptions {
  readonly directory: () => string;
  readonly log: (line: string) => void;
}

export interface PreviewSelectionToolsSurface {
  createPrimary(): HTMLElement;
  directoryChanged(): void;
  dispose(): void;
}

type UuidRow = NonNullable<KtcUuidResultsPanelModel["files"]>[number];
type Strategy = "map_per_value" | "fresh_per_hit";
type Row = KtcReorderMembersPanelRow | UuidRow;
type Action = "open" | "preview" | "apply" | "cancel" | "gitDiff" | "revert";
interface TextSnapshot { readonly before: string; readonly after: string }

/** Real Wing algorithms and result components; the filesystem is strictly in memory. */
export function createPreviewReorderMembersSurface(options: PreviewSelectionToolsOptions): PreviewSelectionToolsSurface {
  return createSurface("reorderMembers", options);
}

export function createPreviewUuidReplaceSurface(options: PreviewSelectionToolsOptions): PreviewSelectionToolsSurface {
  return createSurface("uuidReplace", options);
}

function createSurface(kind: "reorderMembers" | "uuidReplace", options: PreviewSelectionToolsOptions): PreviewSelectionToolsSurface {
  const reorder = kind === "reorderMembers";
  const label = reorder ? "成员排序" : "UUID 替换";
  ktcDefineSelectionPrimary();
  const section = document.createElement("ktc-selection-primary");
  section.dataset.toolId = kind;
  section.setAttribute("aria-label", `${label} Primary`);
  let strategyValue: Strategy = "map_per_value";
  let directory = options.directory().trim();
  let rows: readonly Row[] | undefined;
  let baselineFiles = memoryFixture(reorder);
  let files = new Map(baselineFiles);
  let snapshots = new Map<string, TextSnapshot>();
  let uuidPlan: PnwUuidReplacementPlan | undefined;
  let selected: readonly string[] = [];
  let busy = false;
  let disposed = false;
  let generation = 0;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let confirmation: {
    readonly token: number;
    readonly directory: string;
    readonly strategy: Strategy;
    readonly operation: string;
    readonly execute: () => void;
  } | undefined;
  let message = `点击“${reorder ? "扫描排序" : "扫描 UUID"}”查看内存样例；不会扫描或写入真实文件。`;

  // Match the other Preview-only confirmations. A native browser confirm can
  // be suppressed by embedded browsers; this dialog has explicit UI lifecycle.
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", `${label}模拟确认`);
  dialog.style.cssText = "color:var(--vscode-foreground);background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);padding:12px;max-width:calc(100vw - 24px);width:420px;font:var(--vscode-font-size,13px)/1.4 var(--vscode-font-family,system-ui)";
  const dialogShell = document.createElement("div");
  const dialogRoot = dialogShell.attachShadow({ mode: "open" });
  const dialogStyle = document.createElement("style");
  dialogStyle.textContent = "h2{font-size:14px;margin:0 0 8px;}p{margin:8px 0;overflow-wrap:anywhere;}footer{display:flex;gap:6px;justify-content:flex-end;}button{font:inherit;padding:4px 10px;border:1px solid var(--vscode-button-border,var(--vscode-panel-border));background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);}button:last-child{background:var(--vscode-button-background);color:var(--vscode-button-foreground);}button:focus-visible{outline:1px solid var(--vscode-focusBorder);}";
  const dialogHeading = document.createElement("h2");
  const dialogMessage = document.createElement("p");
  const dialogSafety = document.createElement("p");
  dialogSafety.textContent = "仅更新内存样例文本与状态，不读取、不写入真实文件。";
  const dialogFooter = document.createElement("footer");
  const cancelButton = document.createElement("button");
  const executeButton = document.createElement("button");
  cancelButton.type = executeButton.type = "button";
  cancelButton.textContent = "取消";
  cancelButton.autofocus = true;
  cancelButton.dataset.previewConfirm = "cancel";
  executeButton.dataset.previewConfirm = "execute";
  executeButton.disabled = true;
  dialogFooter.append(cancelButton, executeButton);
  dialogRoot.append(dialogStyle, dialogHeading, dialogMessage, dialogSafety, dialogFooter);
  dialog.append(dialogShell);

  function closeConfirmation(): void {
    confirmation = undefined;
    executeButton.disabled = true;
    if (dialog.open) dialog.close();
  }

  function cancelConfirmation(): void {
    if (!confirmation || disposed) return;
    const operation = confirmation.operation;
    closeConfirmation();
    busy = false;
    message = `已取消${operation}，保留原候选和选择；未执行写入（模拟）。`;
    log(message);
    render();
  }

  cancelButton.addEventListener("click", cancelConfirmation);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); cancelConfirmation(); });
  // A queued close from the previous use must not cancel a newly opened dialog.
  dialog.addEventListener("close", () => { if (!dialog.open) cancelConfirmation(); });
  executeButton.addEventListener("click", () => {
    const pending = confirmation;
    if (!pending || disposed || !dialog.open) return;
    directoryChanged();
    if (confirmation !== pending) return;
    if (pending.token !== generation || pending.directory !== directory || pending.strategy !== strategyValue) {
      invalidate("确认上下文已变化");
      return;
    }
    closeConfirmation();
    pending.execute();
  });

  function askConfirmation(operation: string, count: number, execute: () => void): void {
    confirmation = { token: generation, directory, strategy: strategyValue, operation, execute };
    busy = true;
    dialogHeading.textContent = `${operation}内存样例`;
    dialogMessage.textContent = `当前目录：${directory}。将${operation} ${count} 个样例文件${reorder ? "。" : `；${strategyValue === "map_per_value" ? "同值同替换" : "每处独立新值"}，使用扫描时冻结的映射。`}`;
    executeButton.textContent = `${operation}（模拟）`;
    executeButton.disabled = false;
    message = `等待确认${operation} ${count} 个内存样例。`;
    if (!dialog.isConnected) document.body.append(dialog);
    try { dialog.showModal(); }
    catch (error) {
      closeConfirmation();
      busy = false;
      message = `无法打开模拟确认：${error instanceof Error ? error.message : String(error)}；未执行写入。`;
    }
    log(message);
    render();
  }

  function log(text: string): void { options.log(`[${label}][模拟] ${text}`); }

  function cancelPending(): void {
    generation++;
    closeConfirmation();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    busy = false;
  }

  function invalidate(reason: string): void {
    cancelPending();
    rows = undefined;
    snapshots.clear();
    uuidPlan = undefined;
    selected = [];
    message = `${reason}；旧计划已失效，请重新扫描（模拟）。`;
    log(message);
    render();
  }

  function directoryChanged(): void {
    if (disposed) return;
    const next = options.directory().trim();
    if (next === directory) return;
    directory = next;
    baselineFiles = memoryFixture(reorder);
    files = new Map(baselineFiles);
    invalidate("工作目录已变化");
  }

  function render(): void {
    if (disposed) return;
    const pending = (rows ?? []).filter((row) => row.state === "pending");
    selected = selected.filter((uri) => pending.some((row) => row.uri === uri));
    section.model = {
      toolId: kind, directory, running: busy, scanEnabled: !!directory, uuidStrategy: strategyValue,
      message: directory ? message : "请先选择工作目录；原型不读取真实文件。",
      scanTitle: directory ? "使用 Wing 算法处理内存样例，不读取文件" : "请先选择工作目录",
      applyTitle: "确认后仅更新内存样例文本与状态，不写入文件",
      ...(reorder ? { reorder: {
        presentation: "results", status: busy ? "running" : rows ? "done" : "idle",
        message: "", scanned: rows?.length,
        reorderResults: rows as readonly KtcReorderMembersPanelRow[] | undefined,
        reorderSelectedUris: selected, reorderRevision: revision,
        capabilities: { scan: false, addToWorkset: false, selection: true, open: true, preview: true, apply: true, cancel: true, gitDiff: true, revert: true },
      } } : { uuid: {
        presentation: "files", running: busy,
        files: (rows as readonly UuidRow[] | undefined)?.filter((row) => row.state !== "cancelled"),
        selectedIds: selected,
        emptyMessage: rows ? "没有 UUID 候选（模拟）。" : "点击“扫描 UUID”生成固定映射样例。",
        capabilities: { selection: true, open: true, apply: true, cancel: true, gitDiff: true },
      } }),
    };
  }

  function runLater(description: string, complete: () => void): void {
    const token = ++generation;
    const root = directory;
    busy = true;
    message = `${description}：${root}（仅内存模拟）…`;
    log(message);
    render();
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || token !== generation) return;
      directoryChanged();
      if (token !== generation) return;
      busy = false;
      try { complete(); }
      catch (error) {
        message = `内存样例处理失败：${error instanceof Error ? error.message : String(error)}；未操作真实文件。`;
        log(message);
      }
      render();
    }, 80);
  }

  function scan(): void {
    if (disposed) return;
    directoryChanged();
    if (busy || !directory) return;
    runLater(rows ? "正在重新扫描" : "正在扫描", () => {
      revision++;
      snapshots = new Map();
      if (reorder) {
        rows = [...files].map(([relativePath, text]): KtcReorderMembersPanelRow => {
          const uri = identity(directory, revision, relativePath);
          const header = /\.(?:h|hpp|hh)$/i.test(relativePath);
          const result = header ? pnwReorderHeaderText(text) : pnwReorderCppText(text, relativePath.split("/").at(-1)!.replace(/\.[^.]+$/, ""));
          snapshots.set(uri, { before: text, after: result.text });
          return { uri, relativePath, kind: header ? "header" : "source", encoding: "UTF-8",
            changed: result.changed, state: result.changed ? "pending" : "unchanged", warnings: "warnings" in result ? result.warnings : [] };
        });
      } else {
        const documents = [...files].map(([relativePath, text]) => ({ id: identity(directory, revision, relativePath), relativePath, text }));
        let sequence = 0;
        uuidPlan = pnwPlanUuidReplacements(documents, {
          strategy: strategyValue,
          createUuid: () => `00000000-0000-4000-8000-${(revision * 1000 + ++sequence).toString(16).padStart(12, "0")}`,
        });
        if (!uuidPlan.valid) throw new Error(uuidPlan.diagnostics.join("；"));
        for (const file of documents) snapshots.set(file.id, {
          before: file.text, after: pnwApplyUuidReplacementPlan(file.text, file.id, uuidPlan).text,
        });
        rows = pnwCodeProjectUuidFiles(
          documents.map((file) => ({ uri: file.id, relativePath: file.relativePath, encoding: "UTF-8" })),
          uuidPlan.hits.map((hit) => ({ ...hit, relativePath: documents.find((file) => file.id === hit.fileId)!.relativePath,
            from: hit.from, to: hit.formattedTo, state: "pending" })),
        );
      }
      selected = rows.filter((row) => row.state === "pending").map((row) => row.uri);
      message = `Wing 已扫描 ${files.size} 个内存样例文件，${selected.length} 个待处理${uuidPlan ? `，${uuidPlan.hits.length} 处 UUID` : ""}；未读取真实文件。`;
      log(message);
    });
  }

  function select(ids: readonly string[]): void {
    if (disposed) return;
    directoryChanged();
    if (busy || !rows) return;
    // A detached result row can deliver a late event after a rescan. An empty
    // current selection is intentional; unknown/expired IDs are not "clear all".
    if (ids.some((uri) => !rows?.some((row) => row.uri === uri && row.state === "pending"))) return;
    selected = reorder ? [...new Set(ids)].filter((uri) => rows?.some((row) => row.uri === uri && row.state === "pending"))
      : pnwCodeSelectUuidFileUris(rows as readonly UuidRow[], ids);
    log(`已选择 ${selected.length} 个待处理文件`);
    render();
  }

  function act(action: Action, ids: readonly string[]): void {
    if (disposed) return;
    if (!["open", "preview", "apply", "cancel", "gitDiff", "revert"].includes(action)) return;
    directoryChanged();
    if (busy || !rows) return;
    const targets = rows.filter((row) => ids.includes(row.uri) && row.state !== "cancelled");
    if (!targets.length) return;
    if (action === "open" || action === "preview" || action === "gitDiff") {
      const row = rows.find((item) => item.uri === ids[0] && item.state !== "cancelled");
      if (!row) return;
      if ((action === "preview" && (!reorder || row.state !== "pending")) || (action === "gitDiff" && row.state !== "applied")) return;
      const snapshot = snapshots.get(row.uri);
      if (!snapshot) return;
      const location = `${directory}/${row.relativePath}${"firstLine" in row ? `:${row.firstLine}` : ""}`;
      const content = action === "open" ? files.get(row.relativePath)
        : `--- ${action === "preview" ? "扫描前" : "内存 Git 基线"}\n${action === "preview" ? snapshot.before : baselineFiles.get(row.relativePath)}+++ ${action === "preview" ? "排序后" : "当前内存文本"}\n${action === "preview" ? snapshot.after : files.get(row.relativePath)}`;
      log(`${action === "open" ? "打开源码" : action === "preview" ? "预览排序差异" : "查看 Git 差异"}：${location}；不打开真实文件\n${content}`);
      return;
    }
    const actionable = targets.filter((row) => row.state === (action === "revert" ? "applied" : "pending")
      && (action !== "revert" || row.uri === ids[0]));
    if (!actionable.length || (action === "revert" && !reorder)) return;
    const uris = new Set(actionable.map((row) => row.uri));
    if (action === "cancel") {
      rows = rows.map((row) => uris.has(row.uri) ? { ...row, state: "cancelled" } : row);
      message = `已从本次候选移除 ${uris.size} 个文件；没有删除文件（模拟）。`;
      log(message);
      render();
      return;
    }
    const operation = action === "revert" ? "还原本次成员排序" : reorder ? "应用成员排序" : "替换 UUID";
    askConfirmation(operation, uris.size, () => runLater(operation, () => {
      let completed = 0;
      rows = rows?.map((row) => {
        if (!uris.has(row.uri)) return row;
        const snapshot = snapshots.get(row.uri);
        const expected = action === "revert" ? snapshot?.after : snapshot?.before;
        if (!snapshot || files.get(row.relativePath) !== expected) return { ...row, state: "blocked", warnings: [...row.warnings, "样例文本与冻结预览不一致，请重新扫描"] } as Row;
        if (reorder) {
          files.set(row.relativePath, action === "revert" ? snapshot.before : snapshot.after);
          completed++;
          return { ...row, state: action === "revert" ? "reverted" : "applied" } as KtcReorderMembersPanelRow;
        }
        if (!uuidPlan) return { ...row, state: "blocked", warnings: [...row.warnings, "UUID 映射已失效"] } as UuidRow;
        const hitIds = new Set(uuidPlan.hits.filter((hit) => hit.fileId === row.uri).map((hit) => hit.id));
        const output = pnwApplyUuidReplacementPlan(snapshot.before, row.uri, uuidPlan, hitIds);
        if (output.skippedHitIds.length || output.appliedHitIds.length !== hitIds.size) {
          return { ...row, state: "blocked", warnings: [...row.warnings, "UUID 命中与冻结映射不一致"] } as UuidRow;
        }
        files.set(row.relativePath, output.text);
        completed++;
        return { ...row, state: "applied", hasApplied: true } as UuidRow;
      });
      message = `已${action === "revert" ? "还原" : "应用"} ${completed} 个样例文件${completed < uris.size ? `，${uris.size - completed} 个待核对` : ""}；只更新内存文本与状态，不自动重扫，也未写入真实文件。`;
      log(message);
    }));
  }

  const handleAction = (event: Event): void => {
    const detail = (event as CustomEvent<KtcSelectionPrimaryAction>).detail;
    if (!detail || detail.toolId !== kind || disposed) return;
    if (detail.kind === "scan") scan();
    else if (detail.kind === "selection") select(detail.uris);
    else if (detail.kind === "action") act(detail.action, detail.uris);
    else if (detail.kind === "setStrategy" && !reorder && (!busy || confirmation)) {
      const next = detail.strategy === "fresh_per_hit" ? "fresh_per_hit" : "map_per_value";
      if (next !== strategyValue) { strategyValue = next; invalidate("UUID 生成策略已变化"); }
    }
  };
  section.addEventListener(KTC_SELECTION_PRIMARY_ACTION, handleAction);
  render();
  return {
    createPrimary() { directoryChanged(); return section; },
    directoryChanged,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPending();
      dialog.remove();
      section.removeEventListener(KTC_SELECTION_PRIMARY_ACTION, handleAction);
      section.remove();
    },
  };
}

function identity(directory: string, revision: number, path: string): string {
  return `preview:${revision}:${directory}/${path}`;
}

function memoryFixture(reorder: boolean): Map<string, string> {
  if (reorder) return new Map([
    ["include/Widget.h", "class Widget {\npublic:\n  void Zebra();\n  Widget();\n  void Alpha();\nprivate:\n  int value_;\n};\n"],
    ["src/Widget.cpp", '#include "Widget.h"\n\nvoid Widget::Zebra() { }\nWidget::Widget() { }\nvoid Widget::Alpha() { }\n'],
    ["include/Types.h", "#pragma once\nusing WidgetId = int;\n"],
  ]);
  const oldValue = "11111111-1111-4111-8111-111111111111";
  return new Map([
    ["include/Widget.h", `// In-memory UUID sample\n#pragma once\n\n// Shared identity\n  constexpr auto WidgetId = "${oldValue}";\n  constexpr auto RelatedId = "${oldValue}";\n`],
    ["src/Widget.cpp", `// In-memory UUID sample\n#include "Widget.h"\n\n// Reference\n\n  const auto RelatedId = "${oldValue}";\n`],
    ["resources/Widget.CATDlg", `// In-memory UUID sample\n\n\n\n\n\n  Id = "${oldValue}";\n`],
  ]);
}
