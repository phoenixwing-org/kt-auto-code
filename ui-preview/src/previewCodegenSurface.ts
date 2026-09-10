import {
  KT_CODEGEN_LEGACY_BLOCKS, KtCodegenController, KtCodegenMarker,
  ktCodegenCanApplyValidRegions, ktCodegenProjectApply,
  type KtCodegenSourceFileSnapshot,
} from "@phoenix-wing/kt-codegen";
import { ktCodegenDefineTableElement, type KtCodegenTable } from "@phoenix-wing/kt-codegen/table";
import {
  ktCodegenDefineControlPanelElement, ktCodegenDefinePrimaryPanelElement,
  type KtCodegenControlPanel, type KtCodegenPrimaryPanel, type KtCodegenPrimaryUiModel,
  type KtCodegenPrimaryActionDetail, type KtCodegenControlSelectionDetail,
  type KtCodegenControlOutputDetail, type KtCodegenControlOpenDetail,
  type KtCodegenControlCopyEndDetail, type KtCodegenPrimaryReportUiModel,
} from "@phoenix-wing/kt-codegen/ui";
import { KtcCodegenDocumentModel } from "../../src/tools/codegen/documentModel.js";
import { KtcCodegenControlSessionController } from "../../src/tools/codegen/controlSessionController.js";
import { PREVIEW_CODEGEN_DIRECTORY, PREVIEW_CODEGEN_FIXTURES, type PreviewCodegenFixture } from "./previewCodegenFixture.js";

export interface PreviewCodegenSurfaceOptions {
  readonly log: (message: string) => void;
  readonly openEditor: () => void;
  readonly onContextChanged?: () => void;
}

interface MemoryDocument {
  readonly model: KtcCodegenDocumentModel;
  checkpoint: string;
  readonly sources: Map<string, string>;
  epoch: number;
  pending?: number;
  drawerOpen: boolean;
  tableCollapsed: boolean;
  splitRatio: number;
  message: string;
}

/**
 * Preview adapter only. Real Wing components and pure Auto models share one session
 * per URI; every JSON checkpoint and source change is confined to these Maps.
 * No Host, VS Code, filesystem, fetch, or system clipboard port is installed.
 */
export function createPreviewCodegenSurface(options: PreviewCodegenSurfaceOptions) {
  ktCodegenDefinePrimaryPanelElement();
  ktCodegenDefineTableElement();
  ktCodegenDefineControlPanelElement("ktc-codegen-control-panel");
  const controls = new KtcCodegenControlSessionController();
  const documents = new Map<string, MemoryDocument>();
  const candidateReferences = new Map<string, { entry: MemoryDocument; path: string }>();
  const reports: KtCodegenPrimaryReportUiModel[] = [];
  const reportText = new Map<string, string>();
  let activeUri = "";
  let nextImport = 1;
  let operationEpoch = 0;
  let batchRunning = false;
  let batchCurrent = 0;
  let batchFileName = "";
  let primary: KtCodegenPrimaryPanel | undefined;
  let right: HTMLElement | undefined;
  let actions: HTMLElement | undefined;
  let table: KtCodegenTable | undefined;
  let controlPanel: KtCodegenControlPanel | undefined;
  let drawer: HTMLDetailsElement | undefined;
  let summary: HTMLElement | undefined;
  let feedback: HTMLElement | undefined;
  let sourcePreview: HTMLElement | undefined;
  let inputDialog: HTMLDialogElement | undefined;

  function addDocument(fixture: PreviewCodegenFixture): MemoryDocument {
    const controller = new KtCodegenController();
    const parsed = controller.readJson(fixture.json);
    if (!parsed.ok) throw new Error(`Codegen Preview fixture 无效：${fixture.fileName}`);
    const fsPath = `${PREVIEW_CODEGEN_DIRECTORY}/${fixture.fileName}`;
    const model = new KtcCodegenDocumentModel({ uri: `memory://${fsPath}`, fsPath, fileName: fixture.fileName }, controller);
    const entry: MemoryDocument = {
      model, checkpoint: fixture.json, sources: new Map(fixture.sources.map(({ path, text }) => [path, text])),
      epoch: 0, drawerOpen: false, tableCollapsed: false, splitRatio: 42,
      message: "内存样例 · 尚未预检；不会读写真实项目。",
    };
    documents.set(model.identity.uri, entry);
    return entry;
  }
  for (const fixture of PREVIEW_CODEGEN_FIXTURES) addDocument(fixture);
  activeUri = documents.keys().next().value!;
  const current = () => documents.get(activeUri)!;
  const snapshots = (entry: MemoryDocument): KtCodegenSourceFileSnapshot[] => Array.from(entry.sources, ([path, text]) => ({
    path, text, fingerprint: text, encoding: "UTF-8", eol: "lf",
  }));
  const running = () => batchRunning || Array.from(documents.values()).some((entry) => entry.pending !== undefined);

  function announce(entry: MemoryDocument, message: string): void {
    entry.message = message;
    options.log(`[自动代码][内存模拟] ${entry.model.identity.fileName} · ${message}`);
    render();
  }

  function cancelPending(entry: MemoryDocument): void {
    entry.epoch += 1;
    entry.pending = undefined;
  }

  function sourceFeedback(path: string, line = 0, entry = current()): void {
    const text = entry.sources.get(path);
    const message = text === undefined
      ? `内存样例未提供此源码：${path}`
      : `内存源码 · ${entry.model.identity.fileName} · ${path}:${line + 1}\n${text.split("\n").map((value, index) => `${index + 1}  ${value}`).join("\n")}`;
    showFeedback(message);
    options.log(`[自动代码][内存模拟] ${entry.model.identity.fileName} · 打开源码 ${path}:${line + 1}；未打开真实文件。`);
  }

  function showFeedback(message: string): void {
    if (sourcePreview) {
      sourcePreview.textContent = message;
      sourcePreview.hidden = false;
    }
  }

  function activate(uri: string): void {
    if (!documents.has(uri)) return;
    activeUri = uri;
    if (sourcePreview) { sourcePreview.textContent = ""; sourcePreview.hidden = true; }
    render(true);
    options.onContextChanged?.();
    options.openEditor();
    options.log(`[自动代码][内存模拟] 打开 JSON ${current().model.identity.fileName}；左右共享同一草稿。`);
  }

  function candidateModels(): KtCodegenPrimaryUiModel["candidates"] {
    candidateReferences.clear();
    return Array.from(documents.values()).flatMap((entry) => {
      const scan = new KtCodegenMarker().scan(entry.model.controller.param, { files: snapshots(entry) });
      return Array.from(entry.sources.keys(), (path) => {
        const id = JSON.stringify([entry.model.identity.uri, path]);
        candidateReferences.set(id, { entry, path });
        return {
          id, displayPath: `${entry.model.identity.fileName} · ${path.replace(`${PREVIEW_CODEGEN_DIRECTORY}/`, "")}`,
          markerCount: scan.regions.filter((region) => region.path === path).length,
          encoding: "UTF-8", eol: "lf" as const,
        };
      });
    });
  }

  function primaryModel(): KtCodegenPrimaryUiModel {
    return {
      kind: "kt.codegen.primary-ui-model", schemaVersion: 1, activeId: activeUri,
      documents: Array.from(documents.values(), ({ model }) => ({
        id: model.identity.uri, fileName: model.identity.fileName, displayPath: model.identity.fileName,
        itemCount: model.controller.param.items.length,
        className: `${model.controller.param.namePrefix}${model.controller.param.nameMiddle}`,
        namePrefix: model.controller.param.namePrefix, nameMiddle: model.controller.param.nameMiddle,
        nameSpace: model.controller.param.nameSpace, appendFunction: model.controller.param.appendFunction,
        open: true, active: activeUri === model.identity.uri, dirty: model.dirty,
        externalConflict: model.hasExternalConflict, externalState: model.externalState, diagnosticCount: model.diagnosticCount,
      })),
      controls: controls.viewModel(current().model), candidates: candidateModels(), reports,
      reportInvalidCount: 0, running: running(),
      ...(batchRunning ? { operation: "batch-apply" as const, batch: { current: batchCurrent, total: documents.size, fileName: batchFileName } } : {}),
      capabilities: { openJson: true, importCsv: true, applyAll: true, scanCandidates: true, openReportDirectory: true, outputControlTemplates: true },
    };
  }

  function render(resetTable = false): void {
    const entry = current();
    if (primary) primary.model = primaryModel();
    if (table && resetTable) {
      table.setData(entry.model.getTableData());
      table.collapsed = entry.tableCollapsed;
    }
    if (controlPanel) {
      controlPanel.model = controls.viewModel(entry.model);
      controlPanel.splitRatio = entry.splitRatio;
    }
    if (drawer) drawer.open = entry.drawerOpen;
    const snapshot = entry.model.preflightSnapshot;
    if (summary) summary.textContent = snapshot
      ? `${snapshot.result.plan.markerRegions.length} 命中 · ${snapshot.result.plan.diagnostics.length} 诊断 · ${snapshot.state === "stale" ? "已过期" : snapshot.state === "applied" ? "已应用（内存）" : "内存预检"}`
      : "尚未预检";
    if (feedback) feedback.textContent = `${entry.model.identity.fileName} · ${entry.model.dirty ? "未保存" : "已保存（内存）"} · ${entry.message}`;
    if (right) {
      right.dataset.documentId = activeUri;
      right.setAttribute("aria-busy", String(running()));
    }
    if (table) table.inert = batchRunning;
    if (actions) {
      const preflight = actions.querySelector<HTMLButtonElement>('[data-action="preflight"]')!;
      preflight.textContent = entry.pending !== undefined ? "取消预检" : "预检";
      preflight.setAttribute("aria-pressed", String(entry.pending !== undefined));
      preflight.disabled = batchRunning;
      actions.querySelector<HTMLButtonElement>('[data-action="results"]')!.setAttribute("aria-expanded", String(entry.drawerOpen));
      for (const action of ["save", "reload", "apply"]) {
        actions.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled = running();
      }
    }
  }

  function mutate(entry: MemoryDocument, message: string): void {
    cancelPending(entry);
    announce(entry, message);
  }

  async function preflight(entry: MemoryDocument): Promise<boolean> {
    cancelPending(entry);
    entry.model.setPreflight(undefined);
    const epoch = entry.epoch;
    entry.pending = epoch;
    announce(entry, "正在分析内存源码样例；可取消预检。");
    // Yield one turn so cancellation/editing can revoke this request before Analyze.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (entry.epoch !== epoch || entry.pending !== epoch) return false;
    try {
      const files = snapshots(entry);
      const selected = new Set(entry.model.selectedBlockKeys);
      const targets = [...new Set(KT_CODEGEN_LEGACY_BLOCKS.filter(({ key }) => selected.has(key)).map(({ target }) => target))];
      const plan = entry.model.controller.analyze({ targets, blockKeys: entry.model.selectedBlockKeys, snapshot: { files } });
      if (entry.epoch !== epoch) return false;
      entry.model.setPreflight({
        plan, reused: false, createdAt: new Date().toISOString(), markerIndexRevision: epoch,
        indexedFileCount: files.length, candidateFileCount: files.length, cachePath: "memory://preview-only/no-disk-cache",
      });
      entry.model.recordDiagnostics(plan.diagnostics.length);
      entry.drawerOpen = true;
      entry.pending = undefined;
      announce(entry, `Wing 真实预检内存样例：${plan.markerRegions.length} 命中，${plan.artifacts.length} 产物，${plan.diagnostics.length} 诊断；未扫描磁盘。`);
      return true;
    } catch (error) {
      entry.pending = undefined;
      announce(entry, `预检失败：${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async function apply(entry: MemoryDocument, applyKind: "single" | "batch" = "single"): Promise<void> {
    // Like the formal action, absence of a current plan triggers a fresh preflight;
    // stale readonly results are never reused as an executable plan.
    if (!entry.model.preflight && !await preflight(entry)) return;
    const result = entry.model.preflight;
    if (!result) return;
    if (!ktCodegenCanApplyValidRegions(result.plan)) {
      announce(entry, "Apply 未执行：当前预检没有可安全应用的产物，请查看预检结果。");
      return;
    }
    const projection = ktCodegenProjectApply(result.plan, snapshots(entry));
    if (projection.diagnostics.length) {
      entry.model.setPreflight(undefined);
      announce(entry, `Apply 已阻止：${projection.diagnostics.map(({ message }) => message).join("；")}`);
      return;
    }
    for (const change of projection.changes) entry.sources.set(change.path, change.after);
    const updated = new Set(projection.changes.flatMap(({ regions }) => regions.map(({ id }) => id)));
    entry.model.markPreflightApplied([], result.plan.markerRegions.map(({ id }) => ({
      regionId: id, change: updated.has(id) ? "updated" : "unchanged",
    })));
    const id = `memory-report-${reports.length + 1}`;
    const message = `Apply 已更新 ${projection.changes.length} 个内存文件；没有写入磁盘。`;
    reports.unshift({ id, subject: entry.model.identity.fileName, startedAt: new Date().toISOString(),
      applyKind, itemCount: projection.changes.length, health: result.plan.diagnostics.length ? "warning" : "success",
      change: projection.changes.length ? "updated" : "unchanged" });
    reportText.set(id, `${message}\n${projection.changes.map(({ path, regionCount }) => `${path} · ${regionCount} 区域`).join("\n")}`);
    announce(entry, message);
  }

  function save(): void {
    const entry = current();
    const result = entry.model.controller.writeJson(2);
    if (!result.ok || result.value == null) {
      announce(entry, `保存失败：${result.diagnostics.map(({ message }) => message).join("；")}`);
      return;
    }
    entry.checkpoint = result.value;
    entry.model.markSaved(result.diagnostics.length, result.value);
    render(true);
    table?.setStatus("saved", "JSON 已保存到内存 checkpoint");
    announce(entry, "JSON 已保存到内存 checkpoint；不会创建磁盘文件。");
  }

  function reload(): void {
    const entry = current();
    cancelPending(entry);
    const result = entry.model.reloadFromJson(entry.checkpoint, entry.checkpoint);
    render(true);
    announce(entry, result.ok ? "已从内存 checkpoint 重新加载；未保存编辑已撤销，需重新预检。" : "内存 checkpoint 无效，草稿保持不变。");
  }

  function button(label: string, action: string, callback: () => void): HTMLButtonElement {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.dataset.action = action;
    element.addEventListener("click", callback);
    return element;
  }

  function createImportDialog(kind: "json" | "csv"): void {
    inputDialog?.remove();
    const dialog = document.createElement("dialog");
    dialog.className = "preview-codegen-input-dialog";
    dialog.setAttribute("aria-label", kind === "json" ? "打开内存 JSON 样例" : "导入内存 CSV 样例");
    const title = document.createElement("h3");
    title.textContent = kind === "json" ? "打开 JSON（内存模拟）" : "导入 CSV（内存模拟）";
    const label = document.createElement("p");
    label.textContent = "可编辑下方样例文本。确定后新增内存会话；不打开系统文件、不写磁盘。";
    const input = document.createElement("textarea");
    input.setAttribute("aria-label", kind === "json" ? "JSON 文本" : "CSV 文本");
    input.rows = 12;
    input.value = kind === "json" ? current().checkpoint : current().model.controller.writeCsv().value ?? "";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const close = () => { dialog.close(); dialog.remove(); inputDialog = undefined; };
    const confirm = button(kind === "json" ? "打开" : "导入", "confirm", () => {
      const controller = new KtCodegenController();
      const result = kind === "json" ? controller.readJson(input.value) : controller.readCsv(input.value);
      if (!result.ok) {
        status.textContent = result.diagnostics.map(({ message }) => message).join("；");
        options.log(`[自动代码][内存模拟] ${kind} 读取失败：${status.textContent}`);
        return;
      }
      const serialized = controller.writeJson(2);
      if (!serialized.ok || !serialized.value) {
        status.textContent = serialized.diagnostics.map(({ message }) => message).join("；") || "无法创建内存 JSON。";
        options.log(`[自动代码][内存模拟] ${status.textContent}`);
        return;
      }
      const entry = addDocument({ fileName: `Imported-${nextImport++}.json`, json: serialized.value,
        sources: Array.from(current().sources, ([path, text]) => ({ path, text })) });
      close();
      activate(entry.model.identity.uri);
      announce(entry, `${kind.toUpperCase()} 已读入内存；新会话与已有草稿隔离。`);
    });
    dialog.append(title, label, input, status, button("取消", "cancel", () => {
      options.log(`[自动代码][内存模拟] 已取消 ${kind.toUpperCase()} 输入。`);
      close();
    }), confirm);
    document.body.append(dialog);
    inputDialog = dialog;
    dialog.addEventListener("cancel", () => {
      options.log(`[自动代码][内存模拟] 已取消 ${kind.toUpperCase()} 输入。`);
      close();
    });
    dialog.showModal();
  }

  function handlePrimaryAction(detail: KtCodegenPrimaryActionDetail): void {
    if (detail.action === "openDocument") { activate(detail.id); return; }
    if (detail.action === "updateMeta") {
      const entry = documents.get(detail.id);
      if (batchRunning) { announce(current(), "全部应用期间不接受参数修改。"); return; }
      if (!entry || !entry.model.updateMeta(detail.field, detail.value)) return;
      mutate(entry, "参数已修改，旧预检已失效；请重新预检。");
      return;
    }
    if (detail.action === "openCandidate") {
      const candidate = candidateReferences.get(detail.id);
      if (candidate) sourceFeedback(candidate.path, 0, candidate.entry);
      else announce(current(), "该内存候选已失效，请重新扫描。");
      return;
    }
    if (detail.action === "openReport") {
      showFeedback(reportText.get(detail.id) ?? "该内存报告不存在。");
      options.log(`[自动代码][内存模拟] 打开应用报告 ${detail.id}。`);
      return;
    }
    if (detail.action === "openJson") { createImportDialog("json"); return; }
    if (detail.action === "importCsv") { createImportDialog("csv"); return; }
    if (detail.action === "applyAll") {
      if (running()) return;
      const epoch = ++operationEpoch;
      batchRunning = true;
      void (async () => {
        try {
          batchCurrent = 0;
          for (const entry of documents.values()) {
            if (operationEpoch !== epoch) break;
            batchCurrent += 1;
            batchFileName = entry.model.identity.fileName;
            await apply(entry, "batch");
          }
        } catch (error) {
          announce(current(), `全部应用失败：${error instanceof Error ? error.message : String(error)}`);
        } finally {
          batchRunning = false;
          render();
        }
      })();
      return;
    }
    if (detail.action === "cancelOperation") {
      operationEpoch += 1;
      for (const entry of documents.values()) cancelPending(entry);
      announce(current(), "已取消当前内存操作；未开始的文件不再处理。");
      return;
    }
    if (detail.action === "openReportDirectory") {
      showFeedback(`内存报告目录（不是磁盘目录）\n${Array.from(reportText, ([id, text]) => `${id}\n${text}`).join("\n\n") || "尚无报告。"}`);
      options.log("[自动代码][内存模拟] 打开内存报告目录；未打开真实文件夹。");
      return;
    }
    announce(current(), detail.action === "scanCandidates"
      ? `已用 Wing Marker 重新扫描 ${candidateModels().length} 份内存源码候选；未扫描工作区。`
      : "已刷新内存 JSON 目录；现有草稿和预检状态保留。");
  }

  return {
    contextDirectory: () => PREVIEW_CODEGEN_DIRECTORY,
    fileName: () => current().model.identity.fileName,
    createPrimary(): HTMLElement {
      primary = document.createElement("kt-codegen-primary-panel") as KtCodegenPrimaryPanel;
      primary.addEventListener("kt-codegen-primary-action", (event) => handlePrimaryAction((event as CustomEvent<KtCodegenPrimaryActionDetail>).detail));
      primary.addEventListener("kt-codegen-control-selection-change", (event) => {
        const detail = (event as CustomEvent<KtCodegenControlSelectionDetail>).detail;
        const entry = current();
        const result = controls.handle(entry.model, { type: "codegenControlSelection", ...detail });
        if (result.modelChanged) mutate(entry, result.statusMessage ?? "控制符选择已改变。");
      });
      primary.addEventListener("kt-codegen-control-output", (event) => {
        const detail = (event as CustomEvent<KtCodegenControlOutputDetail>).detail;
        const result = controls.handle(current().model, { type: "codegenControlOutput", ...detail });
        for (const line of result.logLines ?? []) options.log(`[内存模拟] ${line}`);
        showFeedback(result.clipboardText ?? result.statusMessage ?? "当前无可输出控制符。");
        announce(current(), "控制符模板已输出到示例日志和内存文本区；未写系统剪贴板。");
      });
      primary.addEventListener("kt-codegen-control-open", (event) => {
        const { path, line } = (event as CustomEvent<KtCodegenControlOpenDetail>).detail;
        sourceFeedback(path, line);
      });
      primary.addEventListener("kt-codegen-control-copy-end", (event) => {
        const { expectedEnd } = (event as CustomEvent<KtCodegenControlCopyEndDetail>).detail;
        showFeedback(expectedEnd);
        announce(current(), `复制 END（内存文本反馈，未写系统剪贴板）：${expectedEnd}`);
      });
      render();
      return primary;
    },
    createRight(): HTMLElement {
      right = document.createElement("section");
      right.className = "preview-codegen-right";
      const notice = document.createElement("p");
      notice.className = "preview-codegen-notice";
      notice.textContent = "内存样例 · 参数表、控制符与预检使用正式共享组件/算法；保存、重载、Apply 均不读写磁盘。";
      feedback = document.createElement("p");
      feedback.className = "preview-codegen-feedback";
      feedback.setAttribute("role", "status");
      table = document.createElement("kt-codegen-table") as KtCodegenTable;
      table.layout = "page";
      table.collapsible = true;
      table.addEventListener("kt-codegen-table-change", () => {
        if (batchRunning) {
          render(true);
          announce(current(), "全部应用期间不接受参数表修改。");
          return;
        }
        if (current().model.acceptTable(table!.getData()) === "stale") {
          render(true);
          announce(current(), "已拒绝过期表格，请在当前 JSON 继续编辑。");
          return;
        }
        mutate(current(), "参数表已修改，旧预检已失效；请重新预检。");
      });
      table.addEventListener("kt-codegen-table-collapse-change", (event) => {
        current().tableCollapsed = Boolean((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
        options.log(`[自动代码][内存模拟] 参数表${current().tableCollapsed ? "收起" : "展开"}。`);
      });
      drawer = document.createElement("details");
      drawer.className = "preview-codegen-control-drawer";
      const caption = document.createElement("summary");
      caption.append(document.createTextNode("预检结果 "));
      summary = document.createElement("span");
      caption.append(summary);
      controlPanel = document.createElement("ktc-codegen-control-panel") as KtCodegenControlPanel;
      controlPanel.addEventListener("kt-codegen-control-open", (event) => {
        const { path, line } = (event as CustomEvent<KtCodegenControlOpenDetail>).detail;
        sourceFeedback(path, line);
      });
      controlPanel.addEventListener("kt-codegen-control-copy-end", (event) => {
        const { expectedEnd } = (event as CustomEvent<KtCodegenControlCopyEndDetail>).detail;
        showFeedback(expectedEnd);
        announce(current(), `复制 END（内存文本反馈，未写系统剪贴板）：${expectedEnd}`);
      });
      controlPanel.addEventListener("kt-codegen-control-split-change", (event) => {
        current().splitRatio = (event as CustomEvent<{ ratio: number }>).detail.ratio;
        options.log(`[自动代码][内存模拟] 预检结果分栏 ${current().splitRatio}%。`);
      });
      drawer.addEventListener("toggle", () => {
        current().drawerOpen = drawer!.open;
        actions?.querySelector('[data-action="results"]')?.setAttribute("aria-expanded", String(drawer!.open));
      });
      drawer.append(caption, controlPanel);
      sourcePreview = document.createElement("pre");
      sourcePreview.className = "preview-codegen-source-preview";
      sourcePreview.setAttribute("aria-label", "内存源码与操作反馈");
      sourcePreview.hidden = true;
      right.append(notice, feedback, table, drawer, sourcePreview);
      render(true);
      return right;
    },
    createRightActions(): HTMLElement {
      actions = document.createElement("div");
      actions.className = "preview-codegen-right-actions";
      actions.append(
        button("预检", "preflight", () => {
          const entry = current();
          if (entry.pending !== undefined) {
            cancelPending(entry);
            announce(entry, "已取消预检；本次结果不会进入可应用状态。");
          } else void preflight(entry);
        }),
        button("预检结果", "results", () => {
          current().drawerOpen = !current().drawerOpen;
          announce(current(), `预检结果${current().drawerOpen ? "展开" : "收起"}。`);
        }),
        button("应用", "apply", () => { void apply(current()); }),
        button("重新加载", "reload", reload),
        button("保存 JSON", "save", save),
      );
      actions.querySelector('[data-action="apply"]')!.setAttribute("title", "使用 Wing 纯 Apply 更新内存源码；没有当前计划时先预检，不写磁盘");
      actions.querySelector('[data-action="reload"]')!.setAttribute("title", "从内存 checkpoint 重载，撤销未保存编辑；不读取磁盘");
      render();
      return actions;
    },
  };
}
