import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

function source(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("Codegen MVC dependency boundary", () => {
  it("跨宿主审计确认 VS Code 与 Desk 共用 Apply，旧 Qt 仅作行为参考", () => {
    const audit = JSON.parse(source("../../../../doc/codegen-plan/CodegenMvcDependencyAudit.json")) as {
      crossHostConsumers: Array<{ id: string; status: string; duplicatePureLogic?: string[] }>;
    };
    expect(source("./sourceApply.ts")).toContain("ktCodegenProjectApply as ktcProjectCodegenApply");
    expect(audit.crossHostConsumers.find((item) => item.id === "vscode-plugin")?.status)
      .toBe("shared-apply");

    expect(audit.crossHostConsumers.find((item) => item.id === "phoenix-desk-tools"))
      .toMatchObject({
        status: "shared-apply",
        duplicatePureLogic: [],
      });
    expect(audit.crossHostConsumers.find((item) => item.id === "legacy-qt-vb")?.status)
      .toBe("behavior-reference");
    expect(audit.crossHostConsumers.find((item) => item.id === "ktd-mirror")?.status)
      .toBe("source-mirror");
  });

  it("纯 Document Model 不依赖 VS Code、DOM 或文件系统", () => {
    const model = source("./documentModel.ts");
    expect(model).not.toMatch(/from ["']vscode["']/);
    expect(model).not.toMatch(/node:fs|workspace\.fs|Webview|HTMLElement|document\./);
    expect(model).toContain("KtCodegenTableCore");
  });

  it("View Controller 只适配 Webview，不读取或修改领域文件", () => {
    for (const file of ["./editorViewController.ts"]) {
      const viewController = source(file);
      expect(viewController).not.toMatch(/DocumentService|WorkspaceDiscovery|readFile|writeFile|convertCsv|ktcRunCodegenPreflight/);
    }
  });

  it("watcher 生命周期由独立 Service 管理，总 Controller 只接收语义回调", () => {
    const controller = source("./index.ts");
    const watcher = source("./workspaceWatchService.ts");
    expect(controller).not.toContain("createFileSystemWatcher");
    expect(controller).toContain("KtcCodegenWorkspaceWatchService");
    expect(watcher).toContain("createFileSystemWatcher");
    expect(watcher).not.toMatch(/KtCodegenController|KtCodegenParam|KtCodegenTableCore/);
  });

  it("工作区扫描排队由纯协调器管理，不让 watcher 在总 Controller 中互相取消", () => {
    const controller = source("./index.ts");
    const coordinator = source("./workspaceOperationCoordinator.ts");
    expect(controller).toContain("KtcCodegenWorkspaceOperationCoordinator");
    expect(controller).not.toContain("discoveryRefreshPending");
    expect(coordinator).not.toMatch(/from ["']vscode["']|workspace\.|Webview|document\./);
    expect(coordinator).toContain("pendingKinds");
  });

  it("控制符源码导航在纯边界中校验当前预检 region", () => {
    const controller = source("./index.ts");
    const navigation = source("./controlNavigation.ts");
    expect(controller).toContain("ktcFindCodegenControlLocation");
    expect(navigation).not.toMatch(/from ["']vscode["']|showTextDocument|workspace\./);
    expect(navigation).toContain("plan.markerRegions.find");
    expect(navigation).toContain("plan.diagnostics.find");
  });

  it("候选预览由纯 helper 提取控制符行，Host 只负责 VS Code 定位与高亮", () => {
    const controller = source("./index.ts");
    const navigation = source("./candidateNavigation.ts");
    expect(controller).toContain("ktcCodegenCandidateNavigation");
    expect(controller).toContain("ktcHighlightLiteralMatches");
    expect(controller).toContain("preview: true");
    expect(navigation).not.toMatch(/from ["']vscode["']|showTextDocument|workspace\./);
    expect(navigation).toContain("START|END");
  });

  it("预检结果内嵌 JSON View，不再维护第二个 WebviewPanel", () => {
    expect(source("./editorHtml.ts")).toContain('id="control-drawer"');
    expect(source("./editorViewController.ts")).toContain("ViewColumn.Active");
    expect(source("./index.ts")).not.toContain("KtcCodegenControlViewController");
    expect(existsSync(new URL("./controlViewController.ts", import.meta.url))).toBe(false);
  });

  it("简版全部应用冻结 Primary 列表并按显式 URI 串行复用单项 Preflight/Apply", () => {
    const host = source("./index.ts");
    expect(host).toContain('message.action === "applyAll"');
    expect(host).toContain("const documents = this.summaries(ctx.workspaceRoot)");
    expect(host).toContain("await this.ensureKnownDocument(document.uri, ctx)");
    expect(host).toContain("batchOwnedSession = !existingSession && Boolean(session)");
    expect(host).toContain("this.releaseBatchOwnedSession(document.uri)");
    expect(host).toContain("await this.runPreflight(session, ctx)");
    expect(host).toContain("await this.apply(session, ctx)");
    expect(host.indexOf("await this.runPreflight(session, ctx)")).toBeLessThan(
      host.indexOf("await this.apply(session, ctx)"),
    );
    expect(host).toContain("batchDeferredWorkspaceOperations.add(kind)");
    expect(host).toContain('type: "codegenBatchState" as const');
    expect(host).toContain("const outcome = await this.apply(session, ctx)");
    expect(host).toContain("modifiedFileCount: outcome.modifiedFileCount");
    expect(host).toContain("writtenRegionCount: outcome.writtenRegionCount");
    expect(host).toContain("ktcCodegenBatchApplyReportIssues");
    expect(host).toContain("this.batchApplyReports.show(report)");
    expect(host).toContain("await this.persistApplyReport(report, this.primaryReportRoot(ctx), ctx)");
  });

  it("报告目录入口直接打开目录内容，不在系统文件管理器中只选中上级目录", () => {
    const host = source("./index.ts");
    expect(host).toContain("vscode.env.openExternal(directory)");
    expect(host).not.toContain('executeCommand("revealFileInOS", directory)');
  });

  it("Primary 与 JSON View 分别消费 Wing 共享 Web Component，Auto 只保留 Host tag 和消息桥", () => {
    const editor = source("./editorHtml.ts");
    const sidebar = source("../../sidebar/panelHtml.ts");
    const controlEntry = source("./controlCatalogEntry.ts");
    const primaryEntry = source("./primaryPanelEntry.ts");
    expect(editor).toContain('<ktc-codegen-control-panel id="control-panel" mode="full">');
    expect(sidebar).toContain('<ktc-codegen-primary-panel id="codegen-panel" hidden>');
    expect(primaryEntry).toContain('@phoenix-wing/kt-codegen/ui');
    expect(primaryEntry).toContain('ktCodegenDefinePrimaryPanelElement("ktc-codegen-primary-panel")');
    expect(controlEntry).toContain('@phoenix-wing/kt-codegen/ui');
    expect(controlEntry).toContain('ktCodegenDefineControlPanelElement("ktc-codegen-control-panel")');
    expect(existsSync(new URL("./primaryPanel.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("./controlPanel.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("./controlCatalog.ts", import.meta.url))).toBe(false);
    expect(editor).not.toContain("function renderBlocks");
    expect(editor).not.toContain("function renderPreflight");
    expect(sidebar).not.toContain("block.controlWords");
    expect(sidebar).toContain('"kt-codegen-control-selection-change"');
    expect(sidebar).toContain('"kt-codegen-control-output"');
    expect(editor).toContain('"kt-codegen-control-open"');
    expect(editor).toContain('"kt-codegen-control-copy-end"');
    expect(editor).toContain('"kt-codegen-control-split-change"');
  });

  it("Primary ViewModel 由 Host 投影为 Wing 契约，Sidebar 不再拥有 Codegen 业务 DOM", () => {
    const sidebar = source("../../sidebar/panelHtml.ts");
    const primary = source("./primaryViewModel.ts");
    expect(sidebar).toContain("els.codegenPanel.model = model");
    expect(sidebar).toContain('"kt-codegen-primary-action"');
    expect(sidebar).toContain("message.uri = detail.id");
    expect(sidebar).toContain("message.reportId = detail.id");
    expect(sidebar).not.toContain("for (const entry of documents)");
    expect(sidebar).not.toContain('className = "codegen-row"');
    expect(primary).toContain('kind: "kt.codegen.primary-ui-model"');
    expect(primary).toContain("id: entry.uri");
    expect(primary).toContain("id: candidate.uri");
    expect(primary).toContain("id: report.reportId");
    expect(primary).not.toMatch(/acquireVsCodeApi|from ["']vscode["']|workspace\.fs|document\.createElement|document\.querySelector|window\./);
  });

  it("控制符 ViewModel 与命令状态机独立于 VS Code 总 Controller", () => {
    const workspaceController = source("./index.ts");
    const controls = source("./controlSessionController.ts");
    expect(workspaceController).toContain("KtcCodegenControlSessionController");
    expect(workspaceController).not.toContain("ktcCodegenControlTemplateLogLines");
    expect(controls).not.toMatch(/from ["']vscode["']|acquireVsCodeApi|document\.|window\.|workspace\.fs|OutputChannel/);
    expect(controls).toContain("catalogModel");
    expect(controls).toContain("viewModel");
    expect(controls).toContain("handle(");
  });

  it("控制符输出不为隐藏状态区发布整份 Primary 快照", () => {
    const controller = source("./index.ts");
    const start = controller.indexOf("private async handleControlMessage(");
    const end = controller.indexOf("private async apply(", start);
    const controlHandler = controller.slice(start, end);
    expect(controlHandler).toContain('if (message.type === "codegenControlOutput")');
    expect(controlHandler).toContain("output.complete");
    expect(controlHandler).toMatch(/codegenControlOutput[\s\S]*ctx\.log[\s\S]*else \{[\s\S]*this\.publish/);
  });

  it("JSON View 消息先经纯路由收敛，Webview adapter 不再依赖全工具消息总表", () => {
    const controller = source("./index.ts");
    const router = source("./editorMessageRouter.ts");
    const view = source("./editorViewController.ts");
    expect(controller).toContain("ktcRouteCodegenEditorMessage");
    expect(router).toContain('kind: "ignore"');
    expect(router).toContain('kind: "control"');
    expect(router).not.toMatch(/from ["']vscode["']|acquireVsCodeApi|workspace\.|document\.|window\./);
    expect(view).toContain('from "./editorContracts.js"');
    expect(view).toContain("KTC_CODEGEN_EDITOR_LAYOUT_STATE_KEY");
    expect(view).toContain("workspaceState");
    expect(view).not.toContain('from "../types.js"');
  });

  it("Editor 语义命令由纯 Controller 编排，总 Controller 只装配 Host 动作", () => {
    const workspaceController = source("./index.ts");
    const commandController = source("./editorCommandController.ts");
    expect(workspaceController).toContain("ktcExecuteCodegenEditorCommand");
    expect(workspaceController).toContain("editorCommandActions(");
    expect(workspaceController).not.toContain("private async handleEditorMessage(");
    expect(workspaceController).not.toContain("private acceptActionTable(");
    expect(commandController).toContain("KtcCodegenEditorCommandActions");
    expect(commandController).toContain("ktcExecuteCodegenEditorCommand");
    expect(commandController).toContain("actions.runPreflight()");
    expect(commandController).toContain("actions.apply(timer)");
    expect(commandController).not.toMatch(
      /from ["']vscode["']|ToolRunContext|workspace\.|window\.|node:fs|readFile|writeFile|document\./,
    );
  });

  it("Editor session Presenter 统一 Model、状态、控制符与 Problems 输出端口", () => {
    const controller = source("./index.ts");
    const presenter = source("./editorSessionPresenter.ts");
    expect(controller).toContain("KtcCodegenEditorSessionPresenter");
    expect(controller).not.toContain("private editorModel(");
    expect(controller).not.toContain("private postEditor(");
    expect(controller).not.toContain("private updateControlPanel(");
    expect(presenter).toContain("KtcCodegenEditorSessionViewPort");
    expect(presenter).toContain("publishDocumentState");
    expect(presenter).toContain("publishModel");
    expect(presenter).toContain("publishControls");
    expect(presenter).not.toMatch(/from ["']vscode["']|workspace\.|readFile|writeFile|acquireVsCodeApi/);
  });

  it("文档 session Controller 拥有打开与活动态，总 Controller 只装配 VS Code Host", () => {
    const workspaceController = source("./index.ts");
    const sessions = source("./documentSessionController.ts");
    expect(workspaceController).toContain("KtcCodegenDocumentSessionController");
    expect(workspaceController).not.toContain("new KtcCodegenDocumentModel");
    expect(sessions).toContain("KtcCodegenDocumentSnapshotPort");
    expect(sessions).toContain("new KtcCodegenDocumentModel");
    expect(sessions).toContain("activeUri");
    expect(sessions).not.toContain("./documentService");
    expect(sessions).not.toMatch(/from ["']vscode["']|workspace\.|window\.|Webview|HTMLElement|document\.|node:fs/);
  });

  it("预检缓存协议与 VS Code 文件系统适配解耦", () => {
    const cache = source("./preflightCache.ts");
    const preflight = source("./preflight.ts");
    expect(preflight).toContain("ktcValidCodegenPreflightCache");
    expect(preflight).toContain("ktcNextCodegenMarkerIndexRevision");
    expect(cache).not.toMatch(/from ["']vscode["']|workspace\.|readFile|writeFile/);
  });

  it("源码 watcher 标脏后强制复读索引，取消或被替换的预检不能回填旧计划", () => {
    const cache = source("./preflightCache.ts");
    const preflight = source("./preflight.ts");
    const controller = source("./index.ts");
    expect(cache).toContain("ktcCanReuseCodegenMarkerEntry");
    expect(preflight).toContain("forceRefresh");
    expect(controller).toContain("staleSourceRoots");
    expect(controller).toContain("this.candidates = []");

    const cacheWrite = preflight.indexOf("await writeJsonAtomic(cacheUri");
    const cancelAfterWrite = preflight.indexOf("throwIfCancelled(options.cancellationToken)", cacheWrite);
    expect(cacheWrite).toBeGreaterThan(0);
    expect(cancelAfterWrite).toBeGreaterThan(cacheWrite);

    const publishPlan = controller.indexOf("session.setPreflight(result)");
    const ownershipCheck = controller.lastIndexOf(
      "this.preflightTasks.get(session.identity.uri) !== cancellation",
      publishPlan,
    );
    expect(ownershipCheck).toBeGreaterThan(0);
    expect(publishPlan).toBeGreaterThan(ownershipCheck);
  });

  it("源码扫描上限策略独立于 VS Code，避免静默截断", () => {
    const policy = source("./sourceScanPolicy.ts");
    const preflight = source("./preflight.ts");
    expect(policy).not.toMatch(/from ["']vscode["']|workspace\./);
    expect(policy).toContain("KTC_CODEGEN_SOURCE_FILE_LIMIT");
    expect(preflight).toContain("ktcAssertCodegenSourceScanComplete");
  });

  it("每份 JSON 的多根工作区归属由纯路径策略决定", () => {
    const resolver = source("./workspaceRootResolver.ts");
    const controller = source("./index.ts");
    expect(resolver).not.toMatch(/from ["']vscode["']|workspace\./);
    expect(resolver).toContain("workspaceRoots");
    expect(controller).toContain("ktcResolveCodegenWorkspaceRoot");
  });

  it("自动发现上限策略与文件系统适配解耦", () => {
    const policy = source("./workspaceDiscoveryPolicy.ts");
    const discovery = source("./workspaceDiscovery.ts");
    expect(policy).not.toMatch(/from ["']vscode["']|workspace\./);
    expect(discovery).toContain("ktcAssertCodegenDiscoveryComplete");
    expect(discovery).toContain("cancellationToken)");
  });

  it("JSON/CSV 与源码索引共享同一纯字节解码器", () => {
    const codec = source("./sourceCodec.ts");
    expect(codec).not.toMatch(/from ["']vscode["']|workspace\./);
    expect(source("./documentService.ts")).toContain("ktcDecodeCodegenSource");
    expect(source("./preflight.ts")).toContain("ktcDecodeCodegenSource");
  });

  it("Workspace Folder 动态变化会使 Codegen scope 与列表失效重扫", () => {
    expect(source("../../extension.ts")).toContain("notifyCodegenWorkspaceFoldersChanged");
    expect(source("./index.ts")).toContain("workspaceFoldersChanged()");
  });

  it("移除工作区根后的会话保留规则是纯策略", () => {
    const policy = source("./workspaceSessionPolicy.ts");
    expect(policy).not.toMatch(/from ["']vscode["']|workspace\./);
    expect(source("./index.ts")).toContain("ktcShouldRetainCodegenSessionInList");
  });

  it("Apply 投影和事务复用 Wing，宿主只保留编码、文件 Port 与日志映射", () => {
    const controller = source("./index.ts");
    const start = controller.indexOf("private async apply(");
    const end = controller.indexOf("private async save(", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const apply = controller.slice(start, end);
    expect(apply).toContain("ktcProjectCodegenApply");
    expect(apply).not.toContain("if (!plan.canApply)");
    expect(apply).toContain("preflightErrorCount");
    expect(apply).toContain("ktcEncodeCodegenSource");
    expect(apply).toContain("ktcCommitCodegenApplyWrites");
    expect(apply).toContain("readFile");
    expect(apply).toContain("document.isDirty");
    expect(apply).toContain("writeFile");
    expect(apply).toContain("write.before");
    expect(source("./sourceApply.ts")).toContain('from "@phoenix-wing/kt-codegen"');
    expect(source("./sourceApply.ts")).toContain("ktCodegenProjectApply as ktcProjectCodegenApply");
    expect(source("./sourceApplyTransaction.ts")).toContain('from "@phoenix-wing/kt-codegen"');
    expect(source("./sourceApplyTransaction.ts")).toContain("ktCodegenCommitApplyWrites as ktcCommitCodegenApplyWrites");
    expect(source("./sourceApply.ts")).not.toMatch(/from ["']vscode["']|workspace\.|writeFile/);
    expect(source("./sourceApplyTransaction.ts")).not.toMatch(/from ["']vscode["']|workspace\./);
    expect(source("./applyLog.ts")).toContain("ktCodegenInspectApplyPlan");
    expect(controller).toContain('ktcCodegenApplyPlanLogs(plan, "Preflight")');
    expect(apply).not.toContain("ktcCodegenApplyPlanLogs");
    expect(apply).toContain("ktcCodegenAppliedFileLog");
    expect(apply).toContain("apply.rollback-failed");
  });

  it("Apply Receipt 是提交后的宿主证据，数据协议和原子 Store 不反向依赖 VS Code", () => {
    const controller = source("./index.ts");
    const start = controller.indexOf("private async apply(");
    const end = controller.indexOf("private async save(", start);
    const apply = controller.slice(start, end);
    const receipt = source("./applyReceipt.ts");
    const store = source("./applyReceiptStore.ts");

    expect(receipt).not.toMatch(/from ["']vscode["']|workspace\.|node:fs|writeFile/);
    expect(store).not.toMatch(/from ["']vscode["']|workspace\.|node:fs/);
    expect(store).toContain("KtcCodegenApplyReceiptStorePort");
    expect(store).toContain("ktcSerializeCodegenApplyReceipt");
    expect(apply.indexOf("ktcCommitCodegenApplyWrites")).toBeLessThan(
      apply.indexOf("ktcWriteCodegenApplyReceipt"),
    );
    expect(apply).toContain("apply.receipt-write-failed");
    expect(apply).toContain("ktcCodegenFingerprint(write.after)");
  });

  it("JSON Save 通过 DocumentService 的临时复读与保存时 guard，不在 Controller 直接覆盖", () => {
    const controller = source("./index.ts");
    const start = controller.indexOf("private async save(");
    const end = controller.indexOf("private async revert(", start);
    const save = controller.slice(start, end);
    expect(save).toContain("writeValidatedJson");
    expect(save).not.toContain("workspace.fs.writeFile");
    expect(source("./documentService.ts")).toContain("guard.expectedFingerprint");
    expect(source("./documentService.ts")).toContain("保存后的目标 JSON 复读验证不一致");
  });

  it("插件只保留 Wing Web Component 入口，不再维护本地 Table/Core 副本", () => {
    expect(source("./tableEntry.ts")).toContain('@phoenix-wing/kt-codegen/table');
    expect(existsSync(new URL("./tableComponent.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("./model.ts", import.meta.url))).toBe(false);
  });
});
