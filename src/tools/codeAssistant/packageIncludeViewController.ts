import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { appendOutputLine } from "../../output.js";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import { ktcReadProjectEnvironment } from "../../projectEnvironment.js";
import { ktcUseBuiltInIgnore, resolveWorkspaceIgnorePatterns, type KtcWorkspaceIgnoreSourceOptions } from "../../ignoreConfig.js";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";
import {
  ktcEditorPrimaryCompanionStatusMessage,
  type KtcEditorPrimaryCompanionActionToken,
  type KtcEditorPrimaryCompanionLifecycle,
  type KtcEditorPrimaryCompanionSnapshot,
} from "../../core/editorPrimaryCompanionContracts.js";
import {
  ktcApplyPackageIncludes,
  ktcPreviewPackageIncludes,
  ktcResolveDefaultPackageIncludeDirectory,
  ktcResolvePackageIncludeDirectoryFromPublicInclude,
  type KtcPackageIncludePreview,
  type KtcPackageIncludePreviewSession,
} from "./packageIncludeService.js";

const PACKAGE_INCLUDES_TOOL_REGISTRATION = ktcRequireToolRegistration("packageIncludes");
const PACKAGE_DIRECTORY_STATE_KEY = "ktAutoCode.codeAssistant.packageIncludes.packageDirectory";
let nextPackageIncludesCompanionSession = 1;

type KtcPackageIncludeViewStatus = "idle" | "running" | "done" | "error";

interface KtcPackageIncludeViewState {
  readonly type: "state";
  readonly status: KtcPackageIncludeViewStatus;
  readonly message?: string;
  readonly sdkPrefix?: string;
  readonly includeRoot?: string;
  readonly packageDirectory?: string;
  readonly packageDirectoryExists: boolean;
  readonly targetDirectory: string;
  readonly canApply: boolean;
  readonly preview?: KtcPackageIncludePreview;
}

type KtcPackageIncludeViewMessage =
  | { readonly type: "ready" }
  | { readonly type: "updateDraft"; readonly packageDirectory: string; readonly targetDirectory: string }
  | { readonly type: "pickEnvironmentPackageDirectory" }
  | { readonly type: "pickPackageDirectory"; readonly packageDirectory?: string }
  | { readonly type: "preview"; readonly packageDirectory: string; readonly targetDirectory: string }
  | { readonly type: "apply" }
  | { readonly type: "openFile"; readonly filePath: string; readonly line: number }
  | { readonly type: "openEnvironment" };

function isMessage(value: unknown): value is KtcPackageIncludeViewMessage {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return false;
  if (value.type === "updateDraft" || value.type === "preview") {
    return "packageDirectory" in value
      && typeof value.packageDirectory === "string"
      && "targetDirectory" in value
      && typeof value.targetDirectory === "string";
  }
  if (value.type === "pickPackageDirectory") {
    return !("packageDirectory" in value) || value.packageDirectory === undefined || typeof value.packageDirectory === "string";
  }
  if (value.type === "openFile") {
    return "filePath" in value
      && typeof value.filePath === "string"
      && "line" in value
      && typeof value.line === "number"
      && Number.isSafeInteger(value.line);
  }
  return ["ready", "pickEnvironmentPackageDirectory", "apply", "openEnvironment"].includes(value.type);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export interface KtcPackageIncludesPrimaryCompanionPort {
  onDidChange(snapshot: KtcEditorPrimaryCompanionSnapshot): void;
}

/** A single right-side WebviewPanel whose function is currently Package include repair. */
export class KtcPackageIncludeViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private session: KtcPackageIncludePreviewSession | undefined;
  private packageDirectory = "";
  private targetDirectory = "";
  private defaultTargetDirectory = "";
  private state: KtcPackageIncludeViewState = {
    type: "state",
    status: "idle",
    packageDirectoryExists: false,
    targetDirectory: "",
    canApply: false,
  };
  private busy = false;
  private companionSessionId = "";
  private companionRevision = 0;
  private companionReady = false;
  private ignoreSources: KtcWorkspaceIgnoreSourceOptions = {
    ignoreEnabled: true,
    builtInIgnoreEnabled: true,
    gitIgnoreEnabled: true,
    customIgnoreEnabled: false,
  };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly workspaceState: Pick<vscode.Memento, "get" | "update">,
    private readonly log: (text: string) => void = appendOutputLine,
    private readonly companion?: KtcPackageIncludesPrimaryCompanionPort,
  ) {}

  async show(defaultTargetDirectory?: string, ignoreSources?: KtcWorkspaceIgnoreSourceOptions): Promise<void> {
    if (ignoreSources) this.setIgnoreSources(ignoreSources);
    this.defaultTargetDirectory = defaultTargetDirectory ?? this.defaultTargetDirectory;
    if (defaultTargetDirectory) this.targetDirectory = defaultTargetDirectory;
    if (!this.packageDirectory) this.packageDirectory = this.workspaceState.get<string>(PACKAGE_DIRECTORY_STATE_KEY) || "";
    if (!this.targetDirectory) this.targetDirectory = this.defaultTargetDirectory;
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn, false);
      await this.refreshEnvironment();
      return;
    }
    this.companionSessionId = `package-includes-${nextPackageIncludesCompanionSession++}`;
    this.companionRevision = 0;
    this.companionReady = false;
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.packageIncludes",
      PACKAGE_INCLUDES_TOOL_REGISTRATION.title,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri] },
    );
    this.panel = panel;
    panel.webview.html = getPackageIncludeHtml(panel.webview, this.extensionUri, this.state);
    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isMessage(message)) void this.handleMessage(message);
    });
    panel.onDidChangeViewState(({ webviewPanel }) => {
      if (this.panel === webviewPanel) this.publishCompanion();
    });
    panel.onDidDispose(() => this.handlePanelDisposed(panel));
    this.publishCompanion();
    await this.refreshEnvironment();
  }

  setIgnoreSources(ignoreSources: KtcWorkspaceIgnoreSourceOptions): void {
    const next = { ...ignoreSources };
    if (JSON.stringify(next) === JSON.stringify(this.ignoreSources)) return;
    this.ignoreSources = next;
    if (!this.session) return;
    this.session = undefined;
    this.setState({
      status: "idle",
      message: "Ignore 使用策略已改变，请重新预览。",
      preview: undefined,
      canApply: false,
    });
  }

  dispose(): void {
    const panel = this.panel;
    if (!panel) {
      this.session = undefined;
      return;
    }
    panel.dispose();
    this.handlePanelDisposed(panel);
  }

  async runPrimaryCompanionAction(token: KtcEditorPrimaryCompanionActionToken): Promise<boolean> {
    if (
      token.toolId !== "packageIncludes"
      || (token.actionId !== "reveal" && token.actionId !== "preview" && token.actionId !== "openEnvironment")
      || !this.panel
      || token.panelId !== this.companionSessionId
      || token.sessionId !== this.companionSessionId
      || token.revision !== this.companionRevision
      || !this.companionReady
    ) return false;
    if (token.actionId === "openEnvironment") {
      await vscode.commands.executeCommand("ktAutoCode.environment.open");
      return true;
    }
    if (token.actionId === "preview") {
      await this.preview(this.packageDirectory, this.targetDirectory);
      return true;
    }
    this.panel.reveal(this.panel.viewColumn, false);
    return true;
  }

  private async handleMessage(message: KtcPackageIncludeViewMessage): Promise<void> {
    if (message.type === "ready") {
      this.companionReady = true;
      await this.refreshEnvironment();
      return;
    }
    if (message.type === "openEnvironment") {
      await vscode.commands.executeCommand("ktAutoCode.environment.open");
      return;
    }
    if (message.type === "updateDraft") {
      this.packageDirectory = message.packageDirectory.trim();
      this.targetDirectory = message.targetDirectory.trim();
      this.session = undefined;
      await this.workspaceState.update(PACKAGE_DIRECTORY_STATE_KEY, this.packageDirectory);
      this.setState({
        status: "idle",
        message: "目录已编辑，请重新预览后再写入。",
        packageDirectory: this.packageDirectory,
        packageDirectoryExists: !!this.packageDirectory && existsSync(this.packageDirectory),
        targetDirectory: this.targetDirectory,
        preview: undefined,
        canApply: false,
      });
      return;
    }
    if (message.type === "pickEnvironmentPackageDirectory") {
      const selected = await vscode.window.showQuickPick([
        { label: "从 ROOT_DIR_INCLUDE 推导", source: "include" as const },
        { label: "从 ROOT_DIR 推导", source: "root" as const },
      ], {
        placeHolder: "选择 Package 目录推导来源",
      });
      if (selected) await this.useEnvironmentPackageDirectory(selected.source);
      return;
    }
    if (message.type === "pickPackageDirectory") {
      const candidate = message.packageDirectory?.trim() || this.packageDirectory || this.state.packageDirectory;
      const selected = await vscode.window.showOpenDialog({
        title: "选择 Package include 目录",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: candidate && existsSync(candidate) ? vscode.Uri.file(candidate) : undefined,
        openLabel: "使用此目录",
      });
      if (!selected?.[0]) return;
      this.packageDirectory = selected[0].fsPath;
      this.session = undefined;
      await this.workspaceState.update(PACKAGE_DIRECTORY_STATE_KEY, this.packageDirectory);
      await this.refreshEnvironment("Package 目录已更新，请先预览。");
      return;
    }
    if (message.type === "preview") {
      await this.preview(message.packageDirectory, message.targetDirectory);
      return;
    }
    if (message.type === "apply") {
      await this.apply();
      return;
    }
    if (message.type === "openFile") {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(message.filePath));
      const editor = await vscode.window.showTextDocument(document, { preview: true });
      const position = new vscode.Position(Math.max(0, message.line - 1), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  }

  private async useEnvironmentPackageDirectory(source: "include" | "root"): Promise<void> {
    const environment = await ktcReadProjectEnvironment();
    const rootDirectory = environment.values.find((value) => value.key === "customRoot")?.value;
    const sdkPrefix = environment.values.find((value) => value.key === "sdkPrefix")?.value || "kt";
    const includeRoot = environment.values.find((value) => value.key === "includeRoot")?.value;
    this.packageDirectory = source === "include"
      ? (includeRoot ? ktcResolvePackageIncludeDirectoryFromPublicInclude(includeRoot) : "")
      : (rootDirectory ? ktcResolveDefaultPackageIncludeDirectory(rootDirectory, sdkPrefix) : "");
    this.session = undefined;
    await this.workspaceState.update(PACKAGE_DIRECTORY_STATE_KEY, this.packageDirectory);
    const derivation = source === "include"
      ? "ROOT_DIR_INCLUDE"
      : `ROOT_DIR + SDK_PREFIX（${sdkPrefix}）`;
    this.log(this.packageDirectory
      ? existsSync(this.packageDirectory)
        ? `[代码辅助][头文件引用修正][目录推导][OK] ${derivation} -> ${this.packageDirectory}`
        : `[代码辅助][头文件引用修正][目录推导][ERROR] 推导结果不存在：${derivation} -> ${this.packageDirectory}`
      : `[代码辅助][头文件引用修正][目录推导][ERROR] 未读取到 ${source === "include" ? "ROOT_DIR_INCLUDE" : "ROOT_DIR"}，无法推导 Package 目录。`);
    await this.refreshEnvironment(
      this.packageDirectory
        ? derivation + " 推导的 Package 目录已填入，请先预览。"
        : "未读取到 " + (source === "include" ? "ROOT_DIR_INCLUDE" : "ROOT_DIR") + "。",
    );
  }

  private async refreshEnvironment(message = this.state.message): Promise<void> {
    try {
      const environment = await ktcReadProjectEnvironment();
      const sdkPrefix = environment.values.find((value) => value.key === "sdkPrefix")?.value;
      const rootDirectory = environment.values.find((value) => value.key === "customRoot")?.value;
      const includeRoot = environment.values.find((value) => value.key === "includeRoot")?.value;
      const packageDirectory = this.packageDirectory
        || (includeRoot ? ktcResolvePackageIncludeDirectoryFromPublicInclude(includeRoot) : "")
        || (rootDirectory ? ktcResolveDefaultPackageIncludeDirectory(rootDirectory, sdkPrefix) : "");
      this.setState({
        status: this.state.status === "error" ? "idle" : this.state.status,
        message: includeRoot || rootDirectory ? message : "未读取到 ROOT_DIR_INCLUDE 或 ROOT_DIR；请先在工程环境中设置，或直接填写 Package 目录。",
        sdkPrefix,
        includeRoot,
        packageDirectory,
        packageDirectoryExists: !!packageDirectory && existsSync(packageDirectory),
        targetDirectory: this.targetDirectory,
        preview: this.session?.preview,
        canApply: !!this.session?.preview.rows.length,
      });
    } catch (error) {
      this.setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        packageDirectoryExists: false,
        targetDirectory: this.targetDirectory,
        canApply: false,
      });
    }
  }

  private async preview(packageDirectory: string, targetDirectory: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.packageDirectory = packageDirectory.trim() || this.packageDirectory;
    this.targetDirectory = targetDirectory.trim() || this.targetDirectory;
    this.session = undefined;
    await this.workspaceState.update(PACKAGE_DIRECTORY_STATE_KEY, this.packageDirectory);
    await this.refreshEnvironment();
    if (!this.targetDirectory) {
      this.busy = false;
      this.log("[代码辅助][头文件引用修正][预览][ERROR] 未确定工程目录；请从 Primary 带入或临时填写目录。");
      this.setState({ status: "error", message: "未确定工程目录；请从 Primary 带入或临时填写目录。", preview: undefined, canApply: false });
      return;
    }
    if (!this.state.packageDirectory || !this.state.packageDirectoryExists) {
      this.busy = false;
      this.log("[代码辅助][头文件引用修正][预览][ERROR] Package include 目录不可用；请检查 ROOT_DIR_INCLUDE、ROOT_DIR 或直接修改目录。");
      this.setState({ status: "error", message: "Package include 目录不可用；请检查 ROOT_DIR_INCLUDE、ROOT_DIR 或直接修改目录。", preview: undefined, canApply: false });
      return;
    }
    this.log(`[代码辅助][头文件引用修正][预览][INFO] 开始：Package=${this.state.packageDirectory}；工程=${this.targetDirectory}。`);
    this.setState({ status: "running", message: "正在建立 Package 头文件映射并扫描目标目录…", preview: undefined, canApply: false });
    try {
      const session = await ktcPreviewPackageIncludes({
        coreIncludeDirectory: this.state.packageDirectory,
        targetDirectory: this.targetDirectory,
        coreIgnorePatterns: resolveWorkspaceIgnorePatterns(this.state.packageDirectory, this.ignoreSources),
        targetIgnorePatterns: resolveWorkspaceIgnorePatterns(this.targetDirectory, this.ignoreSources),
        useBuiltInIgnore: ktcUseBuiltInIgnore(this.ignoreSources),
      });
      this.session = session;
      const { preview } = session;
      this.log(
        `[代码辅助][头文件引用修正][预览][OK] 完成：映射 ${preview.headerCount} 个头文件；扫描 ${preview.scannedFileCount} 个文件；忽略目录 ${preview.ignoredDirectoryCount} 个；命中 ${preview.rows.length} 处；同名冲突 ${preview.collisions.length} 个；未加入映射 ${preview.skippedHeaderCount} 个。`,
      );
      for (const collision of preview.collisions) {
        this.log(`[代码辅助][头文件引用修正][预览][WARN] 同名冲突：${collision.fileName} -> ${collision.includePaths.join(" | ")}`);
      }
      for (const skipped of preview.skippedHeaders) {
        this.log(`[代码辅助][头文件引用修正][预览][WARN] 未加入映射（不在 source/包目录结构中）：${skipped}`);
      }
      this.setState({
        status: "done",
        message: preview.rows.length
          ? `已扫描 ${preview.scannedFileCount} 个文件，发现 ${preview.rows.length} 处可修正 include。`
          : `已扫描 ${preview.scannedFileCount} 个文件，未发现需要修正的 include。`,
        preview,
        canApply: preview.rows.length > 0,
      });
    } catch (error) {
      this.log(`[代码辅助][头文件引用修正][预览][ERROR] ${error instanceof Error ? error.message : String(error)}`);
      this.setState({ status: "error", message: error instanceof Error ? error.message : String(error), preview: undefined, canApply: false });
    } finally {
      this.busy = false;
    }
  }

  private async apply(): Promise<void> {
    if (this.busy || !this.session || this.session.preview.rows.length === 0) return;
    const preview = this.session.preview;
    const action = await vscode.window.showWarningMessage(
      `将写入 ${preview.rows.length} 处 include（${this.session.files.length} 个文件）。写入前会复核预览后的文件变化。是否继续？`,
      { modal: true },
      "写入修正",
    );
    if (action !== "写入修正") {
      this.log(`[代码辅助][头文件引用修正][写入][INFO] 已取消：预览中的 ${preview.rows.length} 处 include 未写入。`);
      return;
    }
    this.busy = true;
    this.log(`[代码辅助][头文件引用修正][写入][INFO] 开始：${this.session.files.length} 个文件、${preview.rows.length} 处 include。`);
    this.setState({ status: "running", message: "正在复核文件快照并写入 Package include 修正…" });
    try {
      const result = await ktcApplyPackageIncludes(this.session);
      this.session = undefined;
      this.setState({
        status: "done",
        message: `已修正 ${result.changedFiles} 个文件中的 ${result.changedIncludes} 处 include；请通过 Git diff 审查。`,
        preview,
        canApply: false,
      });
      this.log(`[代码辅助][头文件引用修正][写入][OK] 完成：修正 ${result.changedFiles} 个文件、${result.changedIncludes} 处 include；请通过 Git diff 审查。`);
    } catch (error) {
      this.log(`[代码辅助][头文件引用修正][写入][ERROR] ${error instanceof Error ? error.message : String(error)}`);
      this.setState({ status: "error", message: error instanceof Error ? error.message : String(error), canApply: false });
    } finally {
      this.busy = false;
    }
  }

  private setState(update: Omit<Partial<KtcPackageIncludeViewState>, "type" | "targetDirectory" | "packageDirectoryExists" | "canApply"> & {
    readonly targetDirectory?: string;
    readonly packageDirectoryExists?: boolean;
    readonly canApply?: boolean;
  }): void {
    this.state = {
      ...this.state,
      ...update,
      type: "state",
      targetDirectory: update.targetDirectory ?? this.targetDirectory,
      packageDirectoryExists: update.packageDirectoryExists ?? this.state.packageDirectoryExists,
      canApply: update.canApply ?? this.state.canApply,
    };
    void this.panel?.webview.postMessage(this.state);
    if (this.panel) {
      this.companionRevision += 1;
      this.publishCompanion();
    }
  }

  private companionLifecycle(): KtcEditorPrimaryCompanionLifecycle {
    if (!this.panel) return "disposed";
    if (this.panel.active) return "active";
    return this.panel.visible ? "visible" : "open-inactive";
  }

  private companionSnapshot(
    lifecycle: KtcEditorPrimaryCompanionLifecycle = this.companionLifecycle(),
  ): KtcEditorPrimaryCompanionSnapshot {
    const preview = this.state.preview;
    const ready = this.companionReady && lifecycle !== "disposed";
    return {
      panelId: this.companionSessionId,
      toolId: "packageIncludes",
      sessionId: this.companionSessionId,
      revision: this.companionRevision,
      lifecycle,
      status: this.state.status,
      message: ktcEditorPrimaryCompanionStatusMessage(this.state.status, this.state.message),
      ready,
      summary: [
        { label: "工程", value: this.state.targetDirectory || "未选择" },
        { label: "Package", value: this.state.packageDirectory || "未设置" },
        {
          label: "Ignore",
          value: this.ignoreSources.ignoreEnabled === false
            ? "已停用（保留安全排除）"
            : [
              this.ignoreSources.builtInIgnoreEnabled !== false ? "插件" : "",
              this.ignoreSources.gitIgnoreEnabled !== false ? "Git" : "",
              this.ignoreSources.customIgnoreEnabled === true ? "自定义" : "",
            ].filter(Boolean).join(" + ") || "未选择来源",
        },
        { label: "扫描", value: preview ? `${preview.scannedFileCount} 个文件` : "未开始" },
        { label: "命中", value: preview ? `${preview.rows.length} 处` : "0 处" },
      ],
      actions: [
        {
          id: "preview",
          label: preview ? "重新预览" : "预览",
          enabled: ready && !this.busy && !!this.state.packageDirectory && this.state.packageDirectoryExists && !!this.state.targetDirectory,
          tone: "primary",
          ...(this.state.packageDirectory && this.state.packageDirectoryExists && this.state.targetDirectory
            ? {}
            : { disabledReason: "需要有效的 Package 目录和工程目录。" }),
        },
        { id: "reveal", label: "回到 View", enabled: ready },
        { id: "openEnvironment", label: "工程环境", enabled: ready },
      ],
    };
  }

  private publishCompanion(lifecycle?: KtcEditorPrimaryCompanionLifecycle): void {
    if (!this.companion || !this.companionSessionId) return;
    this.companion.onDidChange(this.companionSnapshot(lifecycle));
  }

  private handlePanelDisposed(panel: vscode.WebviewPanel): void {
    if (this.panel !== panel) return;
    this.panel = undefined;
    this.session = undefined;
    this.companionReady = false;
    this.companionRevision += 1;
    this.publishCompanion("disposed");
  }
}

function getPackageIncludeHtml(
  webview: Pick<vscode.Webview, "asWebviewUri" | "cspSource">,
  extensionUri: vscode.Uri,
  initialState: KtcPackageIncludeViewState,
): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  const rightViewShellUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "ktc-right-view-shell.js"),
  ).toString();
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
:root{color-scheme:light dark}*{box-sizing:border-box}html,body{width:100%;height:100%}body{margin:0;padding:0;overflow:hidden;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px/1.4 var(--vscode-font-family)}ktc-right-view-shell{display:block;width:100%;height:100%;min-width:0;min-height:0}.package-includes-main{min-width:0;min-height:100%;padding:8px}button,input{font:inherit}button{min-height:28px;padding:3px 11px;border:1px solid var(--vscode-button-border,transparent);border-radius:3px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}button:hover:not(:disabled){background:var(--vscode-button-secondaryHoverBackground)}button.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}button.primary:hover:not(:disabled){background:var(--vscode-button-hoverBackground)}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}.header-actions{display:flex;min-width:0;align-items:center;gap:7px;overflow-x:auto;scrollbar-width:none}.header-actions::-webkit-scrollbar{display:none}.header-actions button{flex:none;white-space:nowrap}.section{margin:0 0 8px;padding:7px;border:1px solid var(--vscode-panel-border);border-radius:4px}.section h2{margin:0 0 5px;font-size:13px}.row{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:7px;align-items:center;margin:5px 0}.row label{color:var(--vscode-descriptionForeground)}.directory-actions{display:flex;gap:5px}.directory-actions button{padding-inline:7px;white-space:nowrap}input{width:100%;min-width:0;height:29px;padding:3px 7px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:2px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);font-family:var(--vscode-editor-font-family)}input[readonly]{color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background)}input.ready{border-left:3px solid var(--vscode-testing-iconPassed,var(--vscode-focusBorder))}input.missing{border-left:3px solid var(--vscode-errorForeground)}.status{margin:7px 0 0;padding:5px 7px;border-left:2px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);background:var(--vscode-textBlockQuote-background)}.status:empty{display:none}.status.error{border-left-color:var(--vscode-errorForeground);color:var(--vscode-errorForeground)}.summary{display:flex;flex-wrap:wrap;gap:8px;margin:7px 0;color:var(--vscode-descriptionForeground);font-size:12px}.badge{padding:1px 6px;border:1px solid var(--vscode-panel-border);border-radius:999px}.warning{margin:7px 0;padding:7px;border-left:2px solid var(--vscode-editorWarning-foreground);background:var(--vscode-textBlockQuote-background);color:var(--vscode-descriptionForeground);font-size:12px}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border);border-radius:3px;max-height:calc(100vh - 300px)}table{width:max-content;min-width:100%;border-collapse:collapse;font-family:var(--vscode-editor-font-family);font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}th{position:sticky;top:0;background:var(--vscode-editor-background);text-align:left;color:var(--vscode-descriptionForeground);font-family:var(--vscode-font-family)}td.file{min-width:280px;max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}td.line{text-align:right;white-space:pre}td.old,td.new{text-align:left;white-space:pre;max-width:440px;overflow:hidden;text-overflow:ellipsis}tr{cursor:pointer}tr:hover{background:var(--vscode-list-hoverBackground)}.empty{padding:8px;color:var(--vscode-descriptionForeground)}@media(max-width:640px){.package-includes-main{padding:6px}.header-actions{gap:4px}.row{grid-template-columns:1fr}.row label{margin-bottom:-4px}.table-wrap{max-height:calc(100vh - 330px)}}
</style></head><body>
<ktc-right-view-shell id="packageIncludesRightShell"><div id="packageIncludesHeaderActions" class="header-actions" slot="actions"><button id="preview" class="primary" type="button">预览</button><button id="apply" type="button" disabled>写入修正</button><button id="open-env" type="button">工程环境</button></div><main id="packageIncludesMain" class="package-includes-main">
<section><h2>目录</h2><div class="row"><label for="package-directory">Package 目录</label><input id="package-directory" spellcheck="false" title="优先由 ROOT_DIR_INCLUDE 推导；未设置时使用 ROOT_DIR/SDK_PREFIX/core/include" /><span class="directory-actions"><button id="derive-package" type="button" title="选择环境变量并推导 Package include 目录">推导…</button><button id="pick-package" type="button" title="选择 Package include 目录">选择…</button></span></div><div class="row"><label for="target-directory">工程目录</label><input id="target-directory" type="text" spellcheck="false" title="默认来自 Primary 当前目录；可在本次 View 中临时修改" /></div><div class="status" id="status" role="status" aria-live="polite"></div></section>
<section><h2>预览</h2><div id="summary" class="summary"></div><div id="warnings"></div><div id="rows" class="empty">填写 Package 目录后点击“预览修正”。</div></section></main></ktc-right-view-shell>
<script nonce="${nonce}" src="${rightViewShellUri}"></script>
<script nonce="${nonce}">
const rightShell=document.getElementById('packageIncludesRightShell');rightShell.model={title:${safeJson(PACKAGE_INCLUDES_TOOL_REGISTRATION.title)},scrollMode:'vertical'};const vscode=acquireVsCodeApi();let state=${safeJson(initialState)};const byId=id=>document.getElementById(id);const els={packageDirectory:byId('package-directory'),targetDirectory:byId('target-directory'),preview:byId('preview'),apply:byId('apply'),status:byId('status'),summary:byId('summary'),warnings:byId('warnings'),rows:byId('rows')};
const esc=value=>String(value??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function render(){const running=state.status==='running';els.packageDirectory.value=state.packageDirectory||'';els.packageDirectory.className=state.packageDirectoryExists?'ready':'missing';els.targetDirectory.value=state.targetDirectory||'未选择';els.targetDirectory.title=state.targetDirectory||'未选择';els.preview.disabled=running||!els.packageDirectory.value.trim();els.apply.disabled=running||!state.canApply;els.status.textContent=state.message||'';els.status.className='status '+(state.status==='error'?'error':'');const p=state.preview;if(!p){els.summary.innerHTML='';els.warnings.innerHTML='';els.rows.className='empty';els.rows.textContent='填写 Package 目录后点击“预览修正”。';return}els.summary.innerHTML='<span class="badge">映射 '+p.headerCount+' 个头文件</span><span class="badge">扫描 '+p.scannedFileCount+' 个文件</span><span class="badge">忽略 '+p.ignoredDirectoryCount+' 个目录</span><span class="badge">命中 '+p.rows.length+' 处</span>'+(p.unsupportedFileCount?'<span class="badge">跳过 '+p.unsupportedFileCount+' 个未知编码文件</span>':'');const warnings=[];if(p.collisions.length)warnings.push('同名冲突 '+p.collisions.length+' 个，已全部排除，不会自动替换。');if(p.skippedHeaderCount)warnings.push('有 '+p.skippedHeaderCount+' 个头文件不在 source 目录结构中，未加入映射。');els.warnings.innerHTML=warnings.map(item=>'<div class="warning">'+esc(item)+'</div>').join('');if(!p.rows.length){els.rows.className='empty';els.rows.textContent='未发现可修正的 include。';return}els.rows.className='table-wrap';els.rows.innerHTML='<table><thead><tr><th>文件 @ 目录</th><th>行</th><th>旧值</th><th>新值</th></tr></thead><tbody>'+p.rows.map(row=>'<tr data-file="'+esc(row.filePath)+'" data-line="'+row.line+'" title="打开 '+esc(row.relativePath)+' 第 '+row.line+' 行"><td class="file">'+esc(row.fileName)+(row.directory?' @ '+esc(row.directory):'')+'</td><td class="line">'+row.line+'</td><td class="old">'+esc(row.oldValue)+'</td><td class="new">'+esc(row.newValue)+'</td></tr>').join('')+'</tbody></table>';for(const row of els.rows.querySelectorAll('tr[data-file]'))row.onclick=()=>vscode.postMessage({type:'openFile',filePath:row.dataset.file,line:Number(row.dataset.line)});}
function invalidate(message){els.apply.disabled=true;els.status.textContent=message;els.status.className='status'}function syncDraft(){vscode.postMessage({type:'updateDraft',packageDirectory:els.packageDirectory.value,targetDirectory:els.targetDirectory.value})}byId('derive-package').onclick=()=>vscode.postMessage({type:'pickEnvironmentPackageDirectory'});byId('pick-package').onclick=()=>vscode.postMessage({type:'pickPackageDirectory',packageDirectory:els.packageDirectory.value});byId('open-env').onclick=()=>vscode.postMessage({type:'openEnvironment'});els.preview.onclick=()=>vscode.postMessage({type:'preview',packageDirectory:els.packageDirectory.value,targetDirectory:els.targetDirectory.value});els.apply.onclick=()=>vscode.postMessage({type:'apply'});els.packageDirectory.oninput=()=>invalidate('Package 目录已编辑，请重新预览后再写入。');els.targetDirectory.oninput=()=>invalidate('工程目录已编辑，请重新预览后再写入。');els.packageDirectory.onchange=syncDraft;els.targetDirectory.onchange=syncDraft;els.packageDirectory.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();els.preview.click()}};els.targetDirectory.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();els.preview.click()}};window.addEventListener('message',event=>{if(event.data?.type==='state'){state=event.data;render()}});render();vscode.postMessage({type:'ready'});
</script></body></html>`;
}
