import { existsSync, statSync } from "node:fs";
import * as vscode from "vscode";
import { appendOutputLine } from "../../output.js";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import { ktcReadProjectEnvironment } from "../../projectEnvironment.js";
import { ktcUseBuiltInIgnore, resolveWorkspaceIgnorePatterns, type KtcWorkspaceIgnoreSourceOptions } from "../../ignoreConfig.js";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";
import { KTC_PACKAGE_INCLUDES_PRIMARY_ACTION_IDS, ktcIsPackageIncludesDirectoryDraft } from "../../core/packageIncludesPrimaryContracts.js";
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
  readonly writeState?: "pending" | "written" | "unverified";
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
    const draft = value as Record<string, unknown>;
    return ktcIsPackageIncludesDirectoryDraft({ packageDirectory: draft.packageDirectory, targetDirectory: draft.targetDirectory });
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

function isDirectory(path: string): boolean {
  try { return !!path && statSync(path).isDirectory(); } catch { return false; }
}

export interface KtcPackageIncludesPrimaryCompanionPort {
  onDidChange(snapshot: KtcEditorPrimaryCompanionSnapshot): void;
}

/** A single right-side WebviewPanel whose function is currently Package include repair. */
export class KtcPackageIncludeViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private session: KtcPackageIncludePreviewSession | undefined;
  private packageDirectory = "";
  private packageDraftInitialized = false;
  private packageCacheQueue = Promise.resolve();
  private targetDirectory = "";
  private state: KtcPackageIncludeViewState = {
    type: "state",
    status: "idle",
    packageDirectoryExists: false,
    targetDirectory: "",
    canApply: false,
  };
  private busy = false;
  private generation = 0;
  private scanAbort: AbortController | undefined;
  private writeAbort: AbortController | undefined;
  private sessionPolicyFingerprint: string | undefined;
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
    if (!this.panel) {
      // A new task uses only the current working directory, never a previous draft.
      this.targetDirectory = defaultTargetDirectory?.trim() ?? "";
      this.state = { ...this.state, targetDirectory: this.targetDirectory };
    }
    if (!this.packageDirectory) this.packageDirectory = this.workspaceState.get<string>(PACKAGE_DIRECTORY_STATE_KEY) || "";
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
      if (this.panel === panel && isMessage(message)) void this.handleMessage(message);
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
    const sourceChanged = JSON.stringify(next) !== JSON.stringify(this.ignoreSources);
    this.ignoreSources = next;
    const policyChanged = this.sessionPolicyFingerprint !== undefined
      && this.sessionPolicyFingerprint !== this.policyFingerprint();
    if (!sourceChanged && !policyChanged) return;
    this.invalidatePreview("Ignore 使用策略已改变，请重新预览。");
  }

  /** Recheck rule text too: toggles alone cannot detect edits to .gitignore/.ignore. */
  refreshIgnorePolicy(): void { this.setIgnoreSources(this.ignoreSources); }

  private cachePackageDirectory(): Promise<void> {
    const value = this.packageDirectory;
    this.packageCacheQueue = this.packageCacheQueue.catch(() => undefined)
      .then(() => this.workspaceState.update(PACKAGE_DIRECTORY_STATE_KEY, value));
    return this.packageCacheQueue;
  }

  private policyFingerprint(): string {
    const packageRoot = this.packageDirectory || this.state.packageDirectory || "";
    return JSON.stringify([
      this.ignoreSources,
      packageRoot ? resolveWorkspaceIgnorePatterns(packageRoot, this.ignoreSources) : [],
      this.targetDirectory ? resolveWorkspaceIgnorePatterns(this.targetDirectory, this.ignoreSources) : [],
    ]);
  }

  private invalidatePreview(message: string, publish = true): void {
    this.generation += 1;
    this.scanAbort?.abort();
    this.writeAbort?.abort();
    this.scanAbort = undefined;
    this.busy = Boolean(this.writeAbort);
    this.session = undefined;
    this.sessionPolicyFingerprint = undefined;
    const update = {
      status: this.writeAbort ? "running" as const : "idle" as const,
      message,
      preview: undefined,
      writeState: undefined,
      canApply: false,
    };
    if (publish) this.setState(update);
    else this.state = { ...this.state, ...update };
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
      || !KTC_PACKAGE_INCLUDES_PRIMARY_ACTION_IDS.some((id) => id === token.actionId)
      || !this.panel
      || token.panelId !== this.companionSessionId
      || token.sessionId !== this.companionSessionId
      || token.revision !== this.companionRevision
      || !this.companionReady
      || !this.companionSnapshot().actions.some((action) => action.id === token.actionId && action.enabled)
    ) return false;
    if (token.actionId === "openEnvironment") {
      await vscode.commands.executeCommand("ktAutoCode.environment.open");
      return true;
    }
    if (token.actionId === "preview") {
      await this.preview(this.packageDirectory, this.targetDirectory);
      return true;
    }
    if (token.actionId === "updateDraft") {
      if (!ktcIsPackageIncludesDirectoryDraft(token.payload)) return false;
      await this.handleMessage({ type: "updateDraft", ...token.payload });
      return true;
    }
    if (token.actionId === "pickEnvironmentPackageDirectory" || token.actionId === "pickPackageDirectory") {
      await this.handleMessage({ type: token.actionId });
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
      this.packageDraftInitialized = true;
      this.packageDirectory = message.packageDirectory;
      this.targetDirectory = message.targetDirectory;
      this.invalidatePreview("目录已编辑，请重新预览后再写入。", false);
      this.setState({
        status: "idle",
        message: "目录已编辑，请重新预览后再写入。",
        packageDirectory: this.packageDirectory,
        packageDirectoryExists: isDirectory(this.packageDirectory),
        targetDirectory: this.targetDirectory,
        preview: undefined,
        canApply: false,
      });
      await this.cachePackageDirectory();
      return;
    }
    if (message.type === "pickEnvironmentPackageDirectory") {
      const generation = this.generation;
      const panel = this.panel;
      const selected = await vscode.window.showQuickPick([
        { label: "从 ROOT_DIR_INCLUDE 推导", source: "include" as const },
        { label: "从 ROOT_DIR 推导", source: "root" as const },
      ], {
        placeHolder: "选择 Package 目录推导来源",
      });
      if (selected && panel === this.panel && generation === this.generation) await this.useEnvironmentPackageDirectory(selected.source);
      return;
    }
    if (message.type === "pickPackageDirectory") {
      const generation = this.generation;
      const panel = this.panel;
      const candidate = message.packageDirectory?.trim() || this.packageDirectory || this.state.packageDirectory;
      const selected = await vscode.window.showOpenDialog({
        title: "选择 Package include 目录",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: candidate && existsSync(candidate) ? vscode.Uri.file(candidate) : undefined,
        openLabel: "使用此目录",
      });
      if (!selected?.[0] || panel !== this.panel || generation !== this.generation) return;
      this.packageDirectory = selected[0].fsPath;
      this.packageDraftInitialized = true;
      this.invalidatePreview("Package 目录已更新，请先预览。", false);
      const selectedGeneration = this.generation;
      await this.cachePackageDirectory();
      if (panel !== this.panel || selectedGeneration !== this.generation) return;
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
    const generation = this.generation, panel = this.panel;
    const environment = await ktcReadProjectEnvironment();
    if (generation !== this.generation || panel !== this.panel) return;
    const rootDirectory = environment.values.find((value) => value.key === "customRoot")?.value;
    const sdkPrefix = environment.values.find((value) => value.key === "sdkPrefix")?.value || "kt";
    const includeRoot = environment.values.find((value) => value.key === "includeRoot")?.value;
    this.packageDirectory = source === "include"
      ? (includeRoot ? ktcResolvePackageIncludeDirectoryFromPublicInclude(includeRoot) : "")
      : (rootDirectory ? ktcResolveDefaultPackageIncludeDirectory(rootDirectory, sdkPrefix) : "");
    this.packageDraftInitialized = true;
    this.invalidatePreview("Package 目录已更新，请先预览。", false);
    const selectedGeneration = this.generation;
    await this.cachePackageDirectory();
    if (panel !== this.panel || selectedGeneration !== this.generation) return;
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
    const generation = this.generation, panel = this.panel;
    try {
      const environment = await ktcReadProjectEnvironment();
      if (generation !== this.generation || panel !== this.panel) return;
      const sdkPrefix = environment.values.find((value) => value.key === "sdkPrefix")?.value;
      const rootDirectory = environment.values.find((value) => value.key === "customRoot")?.value;
      const includeRoot = environment.values.find((value) => value.key === "includeRoot")?.value;
      const packageDirectory = this.packageDraftInitialized ? this.packageDirectory : this.packageDirectory
        || (includeRoot ? ktcResolvePackageIncludeDirectoryFromPublicInclude(includeRoot) : "")
        || (rootDirectory ? ktcResolveDefaultPackageIncludeDirectory(rootDirectory, sdkPrefix) : "");
      this.packageDirectory = packageDirectory;
      this.packageDraftInitialized = true;
      this.setState({
        status: this.state.status === "error" && this.state.writeState !== "unverified" ? "idle" : this.state.status,
        message: includeRoot || rootDirectory || (this.state.preview && this.state.writeState && this.state.writeState !== "pending")
          ? message : "未读取到 ROOT_DIR_INCLUDE 或 ROOT_DIR；请先在工程环境中设置，或直接填写 Package 目录。",
        sdkPrefix,
        includeRoot,
        packageDirectory,
        packageDirectoryExists: isDirectory(packageDirectory),
        targetDirectory: this.targetDirectory,
        preview: this.session?.preview ?? this.state.preview,
        canApply: !!this.session?.preview.rows.length,
      });
    } catch (error) {
      if (generation !== this.generation || panel !== this.panel) return;
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
    const panel = this.panel;
    const generation = ++this.generation;
    const abort = new AbortController();
    this.scanAbort = abort;
    const current = () => this.panel === panel && this.generation === generation && !abort.signal.aborted;
    this.busy = true;
    this.packageDirectory = packageDirectory.trim();
    this.targetDirectory = targetDirectory.trim();
    this.session = undefined;
    this.setState({ preview: undefined, writeState: undefined, canApply: false });
    await this.cachePackageDirectory();
    await this.refreshEnvironment();
    if (!current()) return;
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
    const policyFingerprint = this.policyFingerprint();
    this.sessionPolicyFingerprint = policyFingerprint;
    try {
      const session = await ktcPreviewPackageIncludes({
        coreIncludeDirectory: this.state.packageDirectory,
        targetDirectory: this.targetDirectory,
        coreIgnorePatterns: resolveWorkspaceIgnorePatterns(this.state.packageDirectory, this.ignoreSources),
        targetIgnorePatterns: resolveWorkspaceIgnorePatterns(this.targetDirectory, this.ignoreSources),
        useBuiltInIgnore: ktcUseBuiltInIgnore(this.ignoreSources),
        signal: abort.signal,
      });
      if (!current()) {
        this.log("[代码辅助][头文件引用修正][预览][INFO] 已丢弃过期扫描结果；目录、Ignore 或会话已变化。");
        return;
      }
      if (policyFingerprint !== this.policyFingerprint()) {
        this.invalidatePreview("Ignore 规则已改变，请重新预览。");
        this.log("[代码辅助][头文件引用修正][预览][INFO] 已丢弃旧 Ignore 规则的扫描结果。");
        return;
      }
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
        writeState: "pending",
        canApply: preview.rows.length > 0,
      });
    } catch (error) {
      if (!current()) {
        this.log("[代码辅助][头文件引用修正][预览][INFO] 已停止过期扫描；未恢复写入资格。");
        return;
      }
      this.log(`[代码辅助][头文件引用修正][预览][ERROR] ${error instanceof Error ? error.message : String(error)}`);
      this.setState({ status: "error", message: error instanceof Error ? error.message : String(error), preview: undefined, canApply: false });
    } finally {
      if (current()) { this.busy = false; this.scanAbort = undefined; this.setState({}); }
    }
  }

  private async apply(): Promise<void> {
    if (this.busy || !this.session || this.session.preview.rows.length === 0) return;
    const session = this.session;
    const preview = session.preview;
    const generation = this.generation;
    const panel = this.panel;
    const policyFingerprint = this.sessionPolicyFingerprint;
    if (policyFingerprint !== this.policyFingerprint()) { this.invalidatePreview("Ignore 规则已改变，请重新预览。"); return; }
    this.busy = true;
    this.setState({ canApply: false });
    const action = await vscode.window.showWarningMessage(
      `将写入 ${preview.rows.length} 处 include（${session.files.length} 个文件）。写入前会复核预览后的文件变化。是否继续？`,
      { modal: true },
      "写入修正",
    );
    if (generation !== this.generation || panel !== this.panel || session !== this.session || policyFingerprint !== this.policyFingerprint()) {
      this.log("[代码辅助][头文件引用修正][写入][INFO] 确认期间任务或 Ignore 已变化；未写入，请重新预览。");
      if (generation === this.generation) this.invalidatePreview("任务或 Ignore 已变化，请重新预览。");
      return;
    }
    if (action !== "写入修正") {
      this.busy = false;
      this.setState({ canApply: true });
      this.log(`[代码辅助][头文件引用修正][写入][INFO] 已取消：预览中的 ${preview.rows.length} 处 include 未写入。`);
      return;
    }
    const abort = new AbortController();
    this.writeAbort = abort;
    this.log(`[代码辅助][头文件引用修正][写入][INFO] 开始：${session.files.length} 个文件、${preview.rows.length} 处 include。`);
    this.setState({ status: "running", message: "正在复核文件快照并写入 Package include 修正…" });
    try {
      const result = await ktcApplyPackageIncludes(session, { signal: abort.signal });
      if (generation !== this.generation || panel !== this.panel) {
        this.log(`[代码辅助][头文件引用修正][写入][INFO] 原任务已变化；本次已写入 ${result.changedFiles} 个文件，不自动回滚。`);
        return;
      }
      const expectedFiles = new Set(preview.rows.map((row) => row.filePath)).size;
      if (result.changedFiles !== expectedFiles || result.changedIncludes !== preview.rows.length) {
        throw new Error(`写入回执与冻结预览不一致（${result.changedFiles}/${expectedFiles} 个文件，${result.changedIncludes}/${preview.rows.length} 处 include）；请通过 Git diff 核对实际文件后重新预览。`);
      }
      this.session = undefined;
      this.setState({
        status: "done",
        message: `已修正 ${result.changedFiles} 个文件中的 ${result.changedIncludes} 处 include；请通过 Git diff 审查。`,
        preview,
        writeState: "written",
        canApply: false,
      });
      this.log(`[代码辅助][头文件引用修正][写入][OK] 完成：修正 ${result.changedFiles} 个文件、${result.changedIncludes} 处 include；请通过 Git diff 审查。`);
    } catch (error) {
      this.log(`[代码辅助][头文件引用修正][写入][ERROR] ${error instanceof Error ? error.message : String(error)}`);
      if (generation === this.generation && panel === this.panel) {
        this.session = undefined;
        this.setState({ status: "error", message: `${error instanceof Error ? error.message : String(error)}；本批次写入结果待核对，不自动回滚，请通过 Git diff 检查后重新预览。`, writeState: "unverified", canApply: false });
      }
    } finally {
      if (this.writeAbort === abort) {
        this.writeAbort = undefined;
        this.busy = Boolean(this.scanAbort);
        if (this.panel) this.setState(this.state.status === "running" ? { status: "idle" } : {});
      }
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
      primary: {
        kind: "packageIncludes",
        model: {
          busy: this.busy,
          packageDirectory: this.state.packageDirectory || "",
          targetDirectory: this.state.targetDirectory,
          packageDirectoryExists: this.state.packageDirectoryExists,
          targetDirectoryExists: isDirectory(this.state.targetDirectory),
          scanStatus: this.writeAbort ? "正在写入或等待已开始的写入结束；请稍候。" : this.state.status === "error"
            ? "任务遇到问题；请在右侧 View 或 Output 中查看详情。"
            : this.state.status === "running" ? "正在建立映射并扫描目标目录…"
            : preview ? `已扫描 ${preview.scannedFileCount} 个文件，${preview.rows.length ? `命中 ${preview.rows.length} 处。` : "未发现需要修正的 include。"}`
            : !this.state.packageDirectoryExists ? "Package 目录不可用；请推导、选择或修改目录。"
            : !isDirectory(this.state.targetDirectory) ? "工程目录不存在或不是目录，请修改后重新预览。"
            : "目录或 Ignore 变化后需重新预览，旧结果不能写入。",
          summary: preview ? [
            { label: "映射", value: `${preview.headerCount} 个头文件` },
            { label: "扫描", value: `${preview.scannedFileCount} 个文件` },
            { label: "忽略", value: `${preview.ignoredDirectoryCount} 个目录` },
            { label: "命中", value: `${preview.rows.length} 处` },
            ...(preview.unsupportedFileCount ? [{ label: "未知编码", value: `${preview.unsupportedFileCount} 个文件` }] : []),
            ...(preview.collisions.length ? [{ label: "同名冲突", value: `${preview.collisions.length} 个，已排除` }] : []),
            ...(preview.skippedHeaderCount ? [{ label: "未加入映射", value: `${preview.skippedHeaderCount} 个头文件` }] : []),
          ] : [{ label: "扫描", value: "未开始" }, { label: "命中", value: "0 处" }],
          ignore: {
            enabled: this.ignoreSources.ignoreEnabled !== false,
            builtInEnabled: this.ignoreSources.builtInIgnoreEnabled !== false,
            gitEnabled: this.ignoreSources.gitIgnoreEnabled !== false,
            customEnabled: this.ignoreSources.customIgnoreEnabled === true,
          },
        },
      },
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
          label: "重新预览",
          enabled: ready && !this.busy && this.state.packageDirectoryExists && isDirectory(this.state.targetDirectory),
          tone: "primary",
          ...(this.state.packageDirectory && this.state.packageDirectoryExists && this.state.targetDirectory
            ? {}
            : { disabledReason: "需要有效的 Package 目录和工程目录。" }),
        },
        { id: "reveal", label: "回到 View", enabled: ready },
        { id: "openEnvironment", label: "工程环境", enabled: ready },
        { id: "pickEnvironmentPackageDirectory", label: "推导…", enabled: ready && !this.busy },
        { id: "pickPackageDirectory", label: "选择…", enabled: ready && !this.busy },
        { id: "updateDraft", label: "目录草稿", enabled: ready && !this.busy },
      ],
    };
  }

  private publishCompanion(lifecycle?: KtcEditorPrimaryCompanionLifecycle): void {
    if (!this.companion || !this.companionSessionId) return;
    this.companion.onDidChange(this.companionSnapshot(lifecycle));
  }

  private handlePanelDisposed(panel: vscode.WebviewPanel): void {
    if (this.panel !== panel) return;
    this.invalidatePreview("View 已关闭。", false);
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
:root{color-scheme:light dark}*{box-sizing:border-box}html,body{width:100%;height:100%}body{margin:0;padding:0;overflow:hidden;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px/1.4 var(--vscode-font-family)}ktc-right-view-shell{display:block;width:100%;height:100%;min-width:0;min-height:0}.package-includes-main{min-width:0;min-height:100%;padding:8px}button,input{font:inherit}button{min-height:28px;padding:3px 11px;border:1px solid var(--vscode-button-border,transparent);border-radius:3px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}button:hover:not(:disabled){background:var(--vscode-button-secondaryHoverBackground)}button.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}button.primary:hover:not(:disabled){background:var(--vscode-button-hoverBackground)}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}.header-actions{display:flex;min-width:0;align-items:center;gap:7px;overflow-x:auto;scrollbar-width:none}.header-actions::-webkit-scrollbar{display:none}.header-actions button{flex:none;white-space:nowrap}.section{margin:0 0 8px;padding:7px;border:1px solid var(--vscode-panel-border);border-radius:4px}.section h2{margin:0 0 5px;font-size:13px}.row{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:7px;align-items:center;margin:5px 0}.row label{color:var(--vscode-descriptionForeground)}.directory-actions{display:flex;gap:5px}.directory-actions button{padding-inline:7px;white-space:nowrap}input{width:100%;min-width:0;height:29px;padding:3px 7px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:2px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);font-family:var(--vscode-editor-font-family)}input[readonly]{color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background)}input.ready{border-left:3px solid var(--vscode-testing-iconPassed,var(--vscode-focusBorder))}input.missing{border-left:3px solid var(--vscode-errorForeground)}.status{margin:7px 0 0;padding:5px 7px;border-left:2px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);background:var(--vscode-textBlockQuote-background)}.status:empty{display:none}.status.error{border-left-color:var(--vscode-errorForeground);color:var(--vscode-errorForeground)}.warning{margin:7px 0;padding:7px;border-left:2px solid var(--vscode-editorWarning-foreground);background:var(--vscode-textBlockQuote-background);color:var(--vscode-descriptionForeground);font-size:12px}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border);border-radius:3px;max-height:none}table{width:max-content;min-width:100%;border-collapse:collapse;font-family:var(--vscode-editor-font-family);font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}th{position:sticky;top:0;background:var(--vscode-editor-background);text-align:left;color:var(--vscode-descriptionForeground);font-family:var(--vscode-font-family)}td.file{min-width:280px;max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}td.line{text-align:right;white-space:pre}td.old,td.new{text-align:left;white-space:pre;max-width:440px;overflow:hidden;text-overflow:ellipsis}tr{cursor:pointer}tr:hover{background:var(--vscode-list-hoverBackground)}.operations{position:sticky;right:0;z-index:1;background:var(--vscode-editor-background);white-space:nowrap;box-shadow:-1px 0 0 var(--vscode-panel-border)}th.operations{z-index:2}.operations .write-state{margin-right:8px}.empty{padding:8px;color:var(--vscode-descriptionForeground)}@media(max-width:640px){.package-includes-main{padding:6px}.header-actions{gap:4px}.row{grid-template-columns:1fr}.row label{margin-bottom:-4px}.table-wrap{max-height:none}}
</style></head><body>
<ktc-right-view-shell id="packageIncludesRightShell"><div id="packageIncludesHeaderActions" class="header-actions" slot="actions"><button id="preview" class="primary" type="button">预览</button><button id="apply" type="button" disabled>写入修正</button></div><main id="packageIncludesMain" class="package-includes-main">
<div class="status" id="status" role="status" aria-live="polite"></div>
<section><div id="warnings"></div><div id="rows" class="empty">请在 Primary 中设置目录，然后点击“预览”。</div></section></main></ktc-right-view-shell>
<script nonce="${nonce}" src="${rightViewShellUri}"></script>
<script nonce="${nonce}">
const rightShell=document.getElementById('packageIncludesRightShell');rightShell.model={title:${safeJson(PACKAGE_INCLUDES_TOOL_REGISTRATION.title)},contextPath:${safeJson(initialState.targetDirectory)},scrollMode:'vertical'};const vscode=acquireVsCodeApi();let state=${safeJson(initialState)};const byId=id=>document.getElementById(id);const els={preview:byId('preview'),apply:byId('apply'),status:byId('status'),warnings:byId('warnings'),rows:byId('rows')};
const esc=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(){rightShell.model={title:${safeJson(PACKAGE_INCLUDES_TOOL_REGISTRATION.title)},contextPath:state.targetDirectory||'',scrollMode:'vertical'};const running=state.status==='running';els.preview.disabled=running||!state.packageDirectoryExists||!state.targetDirectory;els.apply.disabled=running||!state.canApply;els.status.textContent=state.message||'';els.status.className='status '+(state.status==='error'?'error':'');const writeLabel=state.writeState==='written'?'已写入':state.writeState==='unverified'?'待核对':'待写入';const p=state.preview;if(!p){els.warnings.innerHTML='';els.rows.className='empty';els.rows.textContent='请在 Primary 中设置目录，然后点击“预览”。';return}const warnings=[];if(p.unsupportedFileCount)warnings.push('跳过 '+p.unsupportedFileCount+' 个未知编码文件。');if(p.collisions.length)warnings.push('同名冲突 '+p.collisions.length+' 个，已全部排除，不会自动替换。');if(p.skippedHeaderCount)warnings.push('有 '+p.skippedHeaderCount+' 个头文件不在 source 目录结构中，未加入映射。');els.warnings.innerHTML=warnings.map(item=>'<div class="warning">'+esc(item)+'</div>').join('');if(!p.rows.length){els.rows.className='empty';els.rows.textContent='未发现可修正的 include。';return}els.rows.className='table-wrap';els.rows.innerHTML='<table><thead><tr><th>文件 @ 目录</th><th>行</th><th>旧值</th><th>新值</th><th class="operations">状态 / 操作</th></tr></thead><tbody>'+p.rows.map(row=>'<tr data-file="'+esc(row.filePath)+'" data-line="'+row.line+'" title="打开 '+esc(row.relativePath)+' 第 '+row.line+' 行"><td class="file">'+esc(row.fileName)+(row.directory?' @ '+esc(row.directory):'')+'</td><td class="line">'+row.line+'</td><td class="old">'+esc(row.oldValue)+'</td><td class="new">'+esc(row.newValue)+'</td><td class="operations"><span class="write-state">'+writeLabel+'</span><button type="button" title="打开 '+esc(row.filePath)+' 第 '+row.line+' 行" aria-label="打开 '+esc(row.filePath)+' 第 '+row.line+' 行">打开</button></td></tr>').join('')+'</tbody></table>';for(const row of els.rows.querySelectorAll('tr[data-file]')){const open=()=>vscode.postMessage({type:'openFile',filePath:row.dataset.file,line:Number(row.dataset.line)});row.onclick=open;row.querySelector('button').onclick=event=>{event.stopPropagation();open()};}}
els.preview.onclick=()=>vscode.postMessage({type:'preview',packageDirectory:state.packageDirectory||'',targetDirectory:state.targetDirectory||''});els.apply.onclick=()=>vscode.postMessage({type:'apply'});window.addEventListener('message',event=>{if(event.data?.type==='state'){state=event.data;render()}});render();vscode.postMessage({type:'ready'});
</script></body></html>`;
}
