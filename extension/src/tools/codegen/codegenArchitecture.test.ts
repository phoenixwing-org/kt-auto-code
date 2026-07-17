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

  it("控制符与预检内嵌 JSON View，不再维护第二个 WebviewPanel", () => {
    expect(source("./editorHtml.ts")).toContain('id="control-drawer"');
    expect(source("./editorViewController.ts")).toContain("ViewColumn.Active");
    expect(source("./index.ts")).not.toContain("KtcCodegenControlViewController");
    expect(existsSync(new URL("./controlViewController.ts", import.meta.url))).toBe(false);
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
    expect(apply).toContain("ktcCodegenApplyPlanLogs");
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
