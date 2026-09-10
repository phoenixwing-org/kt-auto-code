import { readFile, writeFile, readdir, access, rename, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isDeepStrictEqual, promisify } from "node:util";
import { StringDecoder } from "node:string_decoder";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { getOutputChannel } from "../../output.js";
import { ktcAutoBuildCleanupDirectory } from "../../core/autoBuildCleanupScope.js";
import { ktcReadProjectEnvironment } from "../../projectEnvironment.js";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import { ktcCanAccessAutoBuildPathOnHost, ktcCreateAutoBuildProjectRow, ktcDeduplicateAutoBuildProjectsByOrigin, ktcIsAutoBuildFilesystemRoot, ktcJoinAutoBuildPath, ktcResolveAutoBuildPath, ktcStoreAutoBuildPath, type KtcAutoBuildProjectRow } from "./autoBuildProjectTable.js";
import {
  KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
  KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH,
} from "../../core/rootCleanupPatterns.js";
import { ktcCreateAutoBuildLauncher } from "./autoBuildLauncher.js";
import { ktcUpdateAutoBuildProjectRepository, type KtcAutoBuildGitUpdateResult } from "./autoBuildProjectUpdate.js";
import { ktcPlanNativeCmakeBuild, ktcSelectCmakeBuildTypes } from "./autoBuildNativePlan.js";
import { ktcCreateRepositoryCheckoutScript } from "./autoBuildCheckoutScript.js";
import { ktcInspectAutoBuildScriptSync, ktcSyncAutoBuildScripts } from "./autoBuildScriptSync.js";
import { ktcCreateBuildManifest, ktcParseBuildManifest, type KtcBuildManifestMode } from "./autoBuildManifest.js";
import { ktcAutoBuildRepositoryArguments, ktcAutoBuildRootEnabled, ktcAutoBuildThirdPartyEnabled, ktcExportArguments, ktcLinkCaaArguments, ktcMkArguments, ktcPlanAutoBuildTasks, ktcSelectAutoBuildProjects, ktcValidateAutoBuildConfiguration, type KtcAutoBuildConfiguration, type KtcAutoBuildTask } from "./autoBuildContracts.js";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";
import type {
  KtcEditorPrimaryCompanionActionToken,
  KtcEditorPrimaryCompanionLifecycle,
  KtcEditorPrimaryCompanionSnapshot,
} from "../../core/editorPrimaryCompanionContracts.js";
import { ktcEditorPrimaryCompanionStatusMessage } from "../../core/editorPrimaryCompanionContracts.js";
import {
  ktcCreateAutoBuildPrimaryViewModel,
  type KtcAutoBuildScriptStatusSnapshot,
} from "./autoBuildPrimaryViewModel.js";
import {
  ktcParseAutoBuildCleanupDialogPayload,
  type KtcAutoBuildCleanupDialogRequest,
  type KtcAutoBuildCleanupDialogPayload,
} from "./autoBuildCleanupDialogContracts.js";
import { KtcAutoBuildCleanupYamlWorkspace } from "./autoBuildCleanupYamlWorkspace.js";
import {
  ktcCreateAutoBuildCleanupViewModel,
  type KtcAutoBuildCleanupProjectionState,
} from "./autoBuildCleanupViewModel.js";
import {
  ktcCleanPreviewedWingArtifacts,
  ktcCleanPreviewedWingDirectoryContents,
  ktcExecuteWingGitForcedCleanup,
  ktcPreviewWingCleanupArtifacts,
  ktcPreviewWingDirectoryContents,
  ktcPreviewWingGitForcedCleanup,
  type KtcWingCleanupArtifactPreview,
  type KtcWingGitCleanupPreview,
} from "./autoBuildCleanupWingAdapter.js";
import {
  ktcCloneAutoBuildConfiguration,
  ktcIsAutoBuildConfiguration,
  type KtcAutoBuildConfigurationSnapshotMessage,
  type KtcAutoBuildDraftChangedMessage,
  type KtcAutoBuildDraftRequestAction,
  type KtcAutoBuildDraftReadyMessage,
  type KtcAutoBuildExecutionAction,
  type KtcAutoBuildRightExecutionMessage,
} from "./autoBuildDraftContracts.js";
import {
  ktcAutoBuildTaskSessionKey,
  ktcReconcileAutoBuildTaskPlan,
  ktcUpsertAutoBuildSessionTasks,
} from "./autoBuildTaskSession.js";

const AUTO_BUILD_TOOL_REGISTRATION = ktcRequireToolRegistration("autoBuild");
const STATE_KEY = "ktAutoCode.codeAssistant.autoBuild.configuration", PATH_KEY = "ktAutoCode.codeAssistant.autoBuild.lastPath", RECENT_KEY = "ktAutoCode.codeAssistant.autoBuild.recentPaths";
const execFileAsync = promisify(execFile);
let nextAutoBuildCompanionSession = 1;
interface KtcAutoBuildDraftContext { readonly documentId: string; readonly draftRevision: number; }
interface KtcAutoBuildRightCleanupMessage {
  readonly type: "autoBuildCleanupAction";
  readonly contextId: string;
  readonly token: KtcEditorPrimaryCompanionActionToken;
}
type KtcAutoBuildDraftScopedConfigurationMessage = KtcAutoBuildDraftContext & { readonly configuration: KtcAutoBuildConfiguration };
type Message = KtcAutoBuildDraftReadyMessage | KtcAutoBuildDraftChangedMessage | KtcAutoBuildConfigurationSnapshotMessage | KtcAutoBuildRightExecutionMessage | { type: "stop" | "open" | "save" | "saveAs" | "selectRecent"; path?: string; configuration?: KtcAutoBuildConfiguration } | (KtcAutoBuildDraftScopedConfigurationMessage & { type: "runTask"; taskId?: string }) | (KtcAutoBuildDraftScopedConfigurationMessage & { type: "pickProjectDirectories" | "discoverProjectDirectories" }) | (KtcAutoBuildDraftScopedConfigurationMessage & { type: "probeProject" | "runProject" | "updateProject"; projectId: string }) | { type: "exportLauncher"; configuration: KtcAutoBuildConfiguration } | { type: "writeScript"; configuration: KtcAutoBuildConfiguration; scriptKind: "build" | "checkout" | "manifest"; targetDirectory: string; manifestMode?: KtcBuildManifestMode; manifestTarget?: "root" | "working"; checkoutOptions?: { includeRoots?: boolean; includeBranch?: boolean; includeCommit?: boolean } } | { type: "pickScriptTargetDirectory"; targetDirectory?: string } | { type: "syncRootScript" };
const defaults = (rootDirectory = "", thirdPartyDirectory = "", workingDirectory = ""): KtcAutoBuildConfiguration => ({ schemaVersion: 2, rootDirectory, thirdPartyDirectory, rootEnabled: true, thirdPartyEnabled: true, updateRoot: false, updateThirdParty: false, workingDirectory, buildExecutionMode: "sequential", rootBranch: "develop", branch: "develop", cmakeBranch: "master", projects: [], clean: false, rootCleanupYaml: KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML });

export interface KtcAutoBuildPrimaryCompanionPort {
  onDidChange(snapshot: KtcEditorPrimaryCompanionSnapshot): void;
}

interface KtcAutoBuildSessionContext {
  readonly epoch: number;
  readonly panel: vscode.WebviewPanel;
  readonly sessionId: string;
}

interface KtcAutoBuildPendingConfigurationRequest {
  readonly requestId: string;
  readonly documentId: string;
  readonly minimumDraftRevision: number;
  readonly resolve: (configuration: KtcAutoBuildConfiguration | undefined) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface KtcAutoBuildActiveOperation {
  readonly id: number;
  readonly action: KtcAutoBuildExecutionAction | "runProject" | "updateProject" | "runTask";
}

type KtcAutoBuildPrimaryPendingAction = KtcAutoBuildDraftRequestAction
  | "selectRecent"
  | "openConfig"
  | "cleanupDialog"
  | "syncRootScript"
  | "runProject"
  | "updateProject"
  | "runTask";

type KtcAutoBuildFrozenCleanupTarget =
  | {
    readonly kind: "artifacts" | "directory-contents";
    readonly targetId: string;
    readonly label: string;
    readonly preview: KtcWingCleanupArtifactPreview;
  }
  | {
    readonly kind: "git-force";
    readonly targetId: string;
    readonly label: string;
    readonly preview: KtcWingGitCleanupPreview;
  };

interface KtcAutoBuildFrozenCleanupSession {
  readonly token: string;
  readonly documentId: string;
  readonly draftRevision: number;
  readonly request: KtcAutoBuildCleanupDialogRequest;
  readonly targets: readonly KtcAutoBuildFrozenCleanupTarget[];
}

export class KtcAutoBuildViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined; private readonly processes = new Set<ChildProcessWithoutNullStreams>(); private currentPath = ""; private detectedRootDirectory = ""; private detectedThirdPartyDirectory = ""; private defaultWorkingDirectory = ""; private tasks: KtcAutoBuildTask[] = []; private stopped = false; private nonWindowsRunNoticeShown = false; private readonly output = getOutputChannel();
  private companionSessionId = "";
  private companionRevision = 0;
  private companionReady = false;
  private companionStatus: "idle" | "running" | "done" | "error" = "idle";
  private companionMessage = `打开${AUTO_BUILD_TOOL_REGISTRATION.title}后，可在这里查看任务摘要。`;
  private companionConfiguration: KtcAutoBuildConfiguration | undefined;
  private companionScriptStatus: KtcAutoBuildScriptStatusSnapshot | undefined;
  private companionDocumentId = "";
  private companionDraftRevision = 0;
  private companionPendingAction: KtcAutoBuildPrimaryPendingAction | undefined;
  private pendingConfigurationRequest: KtcAutoBuildPendingConfigurationRequest | undefined;
  private persistedConfigurationFingerprint = "";
  private workingDirectoryBaseline = "";
  private workingDirectoryMismatch = false;
  private loadedConfiguration = false;
  private cleanupState: KtcAutoBuildCleanupProjectionState = {};
  private frozenCleanup: KtcAutoBuildFrozenCleanupSession | undefined;
  private cleanupCancelled = false;
  private cleanupActionRevision: number | undefined;
  private readonly cleanupYamlWorkspace = new KtcAutoBuildCleanupYamlWorkspace();
  private cleanupYamlNotice = "打开清理后仅探测当前工作目录及其子目录中的 cleanup.yaml；只读取已保存文件。";
  private cleanupYamlContext = 0;
  private cleanupYamlConfigurationFingerprint = "";
  private legacyAutomaticCleanupNoticeShown = false;
  private nextConfigurationRequest = 1;
  private nextOperation = 1;
  private gitUpdateAbortController: AbortController | undefined;
  private failedRepositoryPaths = new Set<string>();
  private nativeProcessGroups = new Set<number>();
  private activeOperation: KtcAutoBuildActiveOperation | undefined;
  private companionEpoch = 0;
  private resumeExecutionState = false;
  private resumeViewState = false;
  private readonly sessionContext = new AsyncLocalStorage<KtcAutoBuildSessionContext>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly workspaceState: Pick<vscode.Memento, "get" | "update">,
    private readonly companion?: KtcAutoBuildPrimaryCompanionPort,
  ) {}

  async show(defaultWorkingDirectory?: string): Promise<void> {
    const previousDefaultWorkingDirectory = this.defaultWorkingDirectory;
    this.defaultWorkingDirectory = defaultWorkingDirectory || this.defaultWorkingDirectory;
    if (this.panel) {
      const context = this.currentSessionContext();
      if (!context) return;
      return this.sessionContext.run(context, async () => {
        context.panel.reveal(context.panel.viewColumn, false);
        // Revealing an already-open document must never rewrite its directory context.
        // The incoming directory remains only the fallback for a later explicit fresh config.
        if (this.defaultWorkingDirectory !== previousDefaultWorkingDirectory) {
          if (!this.companionConfiguration?.workingDirectory?.trim()) {
            // An incoming fallback change also changes cleanup scope. Never let
            // a discovered YAML or frozen preview survive into the next directory.
            this.cancelCleanupDialog();
            this.cleanupState = {};
            this.cleanupYamlConfigurationFingerprint = "";
            this.cleanupYamlNotice = "传入目录已变化，请重新探测配置。";
          }
          this.touchCompanion();
        }
        this.publishCompanion();
      });
    }

    const resumingExecution = this.resumeExecutionState
      || (!!this.activeOperation && this.companionStatus === "running");
    const resumingView = this.resumeViewState && !!this.companionConfiguration;
    const resumingProcesses = this.processes.size > 0;
    const sequence = nextAutoBuildCompanionSession++;
    this.companionSessionId = `auto-build-${sequence}`;
    this.companionRevision = 0;
    this.cleanupActionRevision = undefined;
    this.companionReady = false;
    if (resumingProcesses) {
      this.companionStatus = "running";
      this.companionMessage = this.stopped
        ? "正在停止之前启动的任务…"
        : "之前启动的任务仍在运行；Right 重新连接后可停止。";
    } else if (!resumingExecution && !resumingView) {
      this.companionStatus = "idle";
      this.companionMessage = `${AUTO_BUILD_TOOL_REGISTRATION.title}正在初始化…`;
    }
    if (!resumingExecution && !resumingView) {
      this.companionConfiguration = undefined;
      this.companionScriptStatus = undefined;
    }
    this.companionDocumentId = "";
    this.companionDraftRevision = 0;
    if (!resumingExecution) this.companionPendingAction = undefined;
    this.cancelConfigurationRequest();
    if (!resumingExecution && !resumingView) {
      this.currentPath = "";
      this.persistedConfigurationFingerprint = "";
      this.workingDirectoryBaseline = "";
      this.workingDirectoryMismatch = false;
      this.loadedConfiguration = false;
      this.cleanupState = {};
      this.frozenCleanup = undefined;
      this.cleanupCancelled = false;
      this.legacyAutomaticCleanupNoticeShown = false;
      this.detectedRootDirectory = "";
      this.tasks = [];
      this.stopped = false;
    }
    const panel = vscode.window.createWebviewPanel("ktAutoCode.autoBuild", AUTO_BUILD_TOOL_REGISTRATION.title, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri] });
    this.panel = panel;
    const context: KtcAutoBuildSessionContext = {
      epoch: ++this.companionEpoch,
      panel,
      sessionId: this.companionSessionId,
    };
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((message: Message | KtcAutoBuildRightCleanupMessage) => {
      if (!this.isLiveSession(context)) return;
      void this.sessionContext.run(context, () => this.handleSafely(message));
    });
    panel.onDidChangeViewState(({ webviewPanel }) => {
      if (this.panel === webviewPanel) this.publishCompanion();
    });
    panel.onDidDispose(() => {
      if (!this.isLiveSession(context)) return;
      this.cleanupYamlWorkspace.invalidate();
      this.cleanupYamlContext++;
      this.cancelConfigurationRequest();
      this.panel = undefined;
      this.companionReady = false;
      this.companionDocumentId = "";
      this.companionDraftRevision = 0;
      const activeExecution = !!this.activeOperation && this.companionStatus === "running";
      if (!activeExecution) this.companionPendingAction = undefined;
      this.companionEpoch += 1;
      this.resumeViewState = !!this.companionConfiguration;
      if (activeExecution) {
        this.resumeExecutionState = true;
        this.companionMessage = this.stopped
          ? "编译 View 已关闭；正在停止当前执行轮次。"
          : "编译 View 已关闭；当前执行轮次继续运行。重新打开后可查看状态或停止。";
      } else if (this.companionStatus === "running") {
        if (this.processes.size) {
          this.resumeExecutionState = true;
          this.companionMessage = this.stopped
            ? "编译 View 已关闭；正在停止运行中的任务。"
            : "编译 View 已关闭；任务继续运行。重新打开后可查看状态或停止。";
        } else {
          this.companionStatus = "error";
          this.companionMessage = "编译 View 已关闭；进行中的操作已中断跟踪，请重新打开并检查任务状态。";
        }
      }
      this.publishCompanion("disposed");
    });
    this.publishCompanion();
  }
  dispose(): void { this.stopped = true; this.gitUpdateAbortController?.abort(); this.cancelConfigurationRequest(); this.stopTaskProcesses(); this.panel?.dispose(); }

  private stopTaskProcesses(): void {
    for (const child of this.processes) {
      if (child.pid && this.nativeProcessGroups.has(child.pid)) {
        try { process.kill(-child.pid, "SIGTERM"); }
        catch { child.kill(); }
      } else child.kill();
    }
  }

  async runPrimaryCompanionAction(token: KtcEditorPrimaryCompanionActionToken): Promise<boolean> {
    const cleanupPayload = token.actionId === "cleanupDialog"
      ? ktcParseAutoBuildCleanupDialogPayload(token.payload)
      : undefined;
    const cancellingCleanup = cleanupPayload?.kind === "cancel";
    if (
      token.toolId !== "autoBuild"
      || !this.panel
      || token.panelId !== this.companionSessionId
      || token.sessionId !== this.companionSessionId
      || !Number.isSafeInteger(token.revision) || token.revision < 0
      || (cancellingCleanup
        ? token.revision > this.companionRevision
          || token.revision < (this.cleanupActionRevision ?? this.companionRevision)
        : token.revision !== this.companionRevision)
      || !this.companionReady
    ) return false;
    const context = this.currentSessionContext();
    if (!context) return false;
    // Cancel must bypass the ordinary busy/action-enabled gate: cleanup owns
    // that gate while awaiting Wing, but still needs to receive its stop signal.
    if (cancellingCleanup) return this.sessionContext.run(context, () => {
      this.cancelCleanupDialog();
      return true;
    });
    const action = this.companionSnapshot().actions.find((candidate) => candidate.id === token.actionId);
    if (!action?.enabled) return false;
    if (token.actionId === "cleanupDialog") {
      const payload = cleanupPayload;
      if (!payload) return false;
      return this.sessionContext.run(context, () => this.runPrimaryHostAction("cleanupDialog", async () => {
        this.stopped = false;
        this.cleanupCancelled = false;
        this.cleanupActionRevision = token.revision;
        if (payload.kind === "yaml-edit-rules") {
          const yamlContext = this.cleanupYamlContext;
          const documentId = this.companionDocumentId;
          const current = (): boolean => this.isLiveHandler() && !this.cleanupCancelled && !this.stopped
            && yamlContext === this.cleanupYamlContext && documentId === this.companionDocumentId;
          const document = await vscode.workspace.openTextDocument({ language: "yaml", content: payload.rulesYaml });
          if (!current()) return;
          await vscode.window.showTextDocument(document, { preview: true });
          if (!current()) return;
          this.cleanupYamlNotice = "当前规则已交给 VS Code 未保存 YAML；请自行保存，插件未写盘。";
          this.touchCompanion();
          return;
        }
        if (payload.kind === "execute") {
          await this.executeCleanupDialog(payload.request, payload.previewToken);
          return;
        }
        const configuration = await this.requestCurrentConfiguration(context, "cleanupDialog");
        if (!configuration) {
          if (this.stopped || this.cleanupCancelled) return;
          throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        }
        if (payload.kind === "preview") await this.previewCleanupDialog(configuration, payload.request);
        else if (payload.kind === "yaml-discover" || payload.kind === "yaml-open-source" || payload.kind === "yaml-clean-source") {
          await this.runCleanupYamlAction(configuration, payload);
        }
      }));
    }
    if (token.actionId === "preflight" || token.actionId === "start") {
      const actionId: KtcAutoBuildExecutionAction = token.actionId;
      return this.sessionContext.run(context, () => this.runExecutionAction(
        actionId,
        () => this.requestCurrentConfiguration(context, actionId),
      ));
    }
    if (token.actionId === "toggleParallelBuild") {
      return this.sessionContext.run(context, () => this.runPrimaryHostAction("toggleParallelBuild", async () => {
        const configuration = await this.requestCurrentConfiguration(context, "toggleParallelBuild");
        if (!configuration) throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        const buildExecutionMode = configuration.buildExecutionMode === "parallel" ? "sequential" : "parallel";
        const next = ktcCloneAutoBuildConfiguration({ ...configuration, buildExecutionMode });
        this.companionConfiguration = next;
        this.touchCompanion();
        await this.post({ type: "buildExecutionMode", value: buildExecutionMode });
      }));
    }
    if (token.actionId === "setCmakeBuildTypes") {
      const value = token.value;
      if (typeof value !== "string" || !/^(?:Debug(?:,Release)?|Release)?$/u.test(value)) return false;
      return this.sessionContext.run(context, () => this.runPrimaryHostAction("setCmakeBuildTypes", async () => {
        const configuration = await this.requestCurrentConfiguration(context, "setCmakeBuildTypes");
        if (!configuration) throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        const cmakeBuildTypes = value ? value.split(",") as ("Debug" | "Release")[] : [];
        this.companionConfiguration = ktcCloneAutoBuildConfiguration({ ...configuration, cmakeBuildTypes });
        this.log(`CMake 编译配置：${cmakeBuildTypes.join(" + ") || "未选择（启动时会提示）"}；保存后写入当前 AutoBuild JSON。`);
        this.touchCompanion();
        await this.post({ type: "cmakeBuildTypes", value: cmakeBuildTypes });
      }));
    }
    if (token.actionId === "saveConfig") {
      return this.sessionContext.run(context, () => this.runPrimaryHostAction("saveConfig", async () => {
        const configuration = await this.requestCurrentConfiguration(context, "saveConfig");
        if (!configuration) throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        await this.save(configuration, false);
      }));
    }
    if (token.actionId === "saveAsConfig") {
      return this.sessionContext.run(context, () => this.runPrimaryHostAction("saveAsConfig", async () => {
        const configuration = await this.requestCurrentConfiguration(context, "saveAsConfig");
        if (!configuration) throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        await this.save(configuration, true);
      }));
    }
    if (token.actionId === "closeConfig") {
      return this.sessionContext.run(context, () => this.runPrimaryHostAction("closeConfig", async () => {
        const configuration = await this.requestCurrentConfiguration(context, "closeConfig");
        if (!configuration) throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        if (!await this.confirmCloseConfiguration(configuration)) return;
        await this.resetToFreshConfiguration();
      }));
    }
    if (token.actionId === "newConfigForDirectory" || token.actionId === "keepProjectsForDirectory") {
      const actionId = token.actionId;
      return this.sessionContext.run(context, () => this.runPrimaryHostAction(actionId, async () => {
        const configuration = await this.requestCurrentConfiguration(context, actionId);
        if (!configuration) throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        if (actionId === "newConfigForDirectory") await this.startNewConfigurationForDirectory(configuration);
        else await this.keepProjectsForDirectory(configuration);
      }));
    }
    const recentIndex = /^selectRecent(\d+)$/u.exec(token.actionId)?.[1];
    if (recentIndex !== undefined) {
      const path = (this.workspaceState.get<string[]>(RECENT_KEY) || [])[Number(recentIndex)];
      if (!path) return false;
      return this.sessionContext.run(context, () => this.runPrimaryHostAction("selectRecent", async () => {
        const configuration = await this.requestCurrentConfiguration(context, "selectRecent");
        if (!configuration) throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        if (!await this.confirmDiscardChanges(configuration)) return;
        await this.load(path);
      }));
    }
    if (token.actionId === "syncRootScript") {
      return this.sessionContext.run(context, () => this.runPrimaryHostAction(
        "syncRootScript",
        () => this.handle({ type: "syncRootScript" }),
      ));
    }
    if (token.actionId === "openScript") {
      context.panel.reveal(context.panel.viewColumn, false);
      await this.sessionContext.run(context, () => this.post({ type: "openScriptManager" }));
      return this.isLiveSession(context);
    }
    if (token.actionId === "reveal") {
      this.panel.reveal(this.panel.viewColumn, false);
      return true;
    }
    if (token.actionId === "stop") {
      await this.sessionContext.run(context, () => this.handle({ type: "stop" }));
      return this.isLiveSession(context);
    }
    if (token.actionId === "openOutput") {
      this.output.show(true);
      return true;
    }
    if (token.actionId === "openConfig") {
      return this.sessionContext.run(context, () => this.runPrimaryHostAction("openConfig", async () => {
        const configuration = await this.requestCurrentConfiguration(context, "openConfig");
        if (!configuration) throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
        if (!await this.confirmDiscardChanges(configuration)) return;
        await this.openConfigurationFromDialog();
      }));
    }
    return false;
  }
  private log(text: string, show = false): void { this.output.appendLine(`[Auto Build] ${text}`); if (show) this.output.show(true); }
  private async handleSafely(message: Message | KtcAutoBuildRightCleanupMessage): Promise<void> {
    if (!this.isLiveHandler()) return;
    if (message.type === "autoBuildCleanupAction") {
      const token = message.token;
      if (!token || typeof token !== "object" || token.actionId !== "cleanupDialog"
        || message.contextId !== `${this.companionDocumentId}:${this.cleanupYamlContext}`) return;
      // The Right dialog uses the same Host-owned session/revision, busy and cancel gates.
      await this.runPrimaryCompanionAction(token);
      return;
    }
    if (message.type === "draftChanged") {
      this.acceptDraft(message.documentId, message.draftRevision, message.configuration);
      return;
    }
    if (message.type === "configurationSnapshot") {
      this.acceptConfigurationSnapshot(message);
      return;
    }
    if (message.type === "preflight" || message.type === "start") {
      if (!this.acceptDraft(message.documentId, message.draftRevision, message.configuration, true)) return;
      const configuration = this.companionConfiguration;
      if (!configuration) return;
      await this.runExecutionAction(message.type, async () => ktcCloneAutoBuildConfiguration(configuration));
      return;
    }
    if (message.type === "stop") {
      this.log("action received: stop");
      await this.handle(message);
      return;
    }
    if (message.type === "open") {
      await this.runPrimaryHostAction("openConfig", () => this.handle(message));
      return;
    }
    if (message.type === "selectRecent") {
      await this.runPrimaryHostAction("selectRecent", () => this.handle(message));
      return;
    }
    if (message.type === "syncRootScript") {
      await this.runPrimaryHostAction("syncRootScript", () => this.handle(message));
      return;
    }
    if (message.type === "save" || message.type === "saveAs") {
      if (!ktcIsAutoBuildConfiguration(message.configuration)) return;
      await this.runPrimaryHostAction(
        message.type === "saveAs" ? "saveAsConfig" : "saveConfig",
        async () => { await this.save(message.configuration!, message.type === "saveAs"); },
      );
      return;
    }
    if (message.type === "runTask"
      || message.type === "pickProjectDirectories"
      || message.type === "discoverProjectDirectories"
      || message.type === "probeProject"
      || message.type === "updateProject"
      || message.type === "runProject") {
      if (!this.acceptDraft(message.documentId, message.draftRevision, message.configuration, true)) return;
    }
    if (message.type === "runTask" || message.type === "runProject" || message.type === "updateProject") {
      await this.runRightProjectAction(message.type, () => this.handle(message));
      return;
    }
    this.log(`action received: ${message.type}`);
    try {
      await this.handle(message);
    } catch (error) {
      if (!this.isLiveHandler()) return;
      const text = error instanceof Error ? error.message : String(error);
      this.log(`ERROR ${text}`, true);
      await this.status("error", text);
    }
  }

  private async runExecutionAction(
    action: KtcAutoBuildExecutionAction,
    readConfiguration: () => Promise<KtcAutoBuildConfiguration | undefined>,
  ): Promise<boolean> {
    const operation = this.beginExecutionOperation(action);
    if (!operation) return false;
    // Start the atomic draft request synchronously so a second click/Stop observes both
    // the operation lock and its request before this method reaches its first await.
    const configurationRequest = readConfiguration();
    return this.runDetachedExecutionOperation(operation, `正在读取${action === "start" ? "启动" : "预检"}配置…`, async () => {
      const configuration = await configurationRequest;
      if (!configuration) {
        if (this.stopped) return;
        throw new Error("无法读取右侧当前配置，请检查详细配置后重试。");
      }
      await this.handle({
        type: action,
        configuration,
        documentId: this.companionDocumentId,
        draftRevision: this.companionDraftRevision,
      });
    });
  }

  private async runPrimaryHostAction(
    action: Exclude<KtcAutoBuildPrimaryPendingAction, KtcAutoBuildExecutionAction>,
    execute: () => Promise<void>,
  ): Promise<boolean> {
    if (this.companionPendingAction || this.companionStatus === "running") return false;
    this.companionPendingAction = action;
    this.touchCompanion();
    this.log(`action received: ${action}`);
    try {
      await execute();
      return this.isLiveHandler();
    } catch (error) {
      if (!this.isLiveHandler()) return false;
      const text = error instanceof Error ? error.message : String(error);
      this.log(`ERROR ${text}`, true);
      await this.status("error", text);
      return true;
    } finally {
      if (this.isLiveHandler() && this.companionPendingAction === action) {
        this.companionPendingAction = undefined;
        this.touchCompanion();
      }
    }
  }

  private async runRightProjectAction(
    action: "runProject" | "updateProject" | "runTask",
    execute: () => Promise<void>,
  ): Promise<boolean> {
    const operation = this.beginExecutionOperation(action);
    if (!operation) return false;
    return this.runDetachedExecutionOperation(
      operation,
      action === "updateProject" ? "正在更新所选 Git 仓库（TypeScript）…" : action === "runProject" ? "正在准备项目任务…" : "正在准备所选任务…",
      execute,
    );
  }

  private beginExecutionOperation(
    action: KtcAutoBuildExecutionAction | "runProject" | "updateProject" | "runTask",
  ): KtcAutoBuildActiveOperation | undefined {
    if (this.activeOperation || this.companionPendingAction || this.companionStatus === "running" || this.processes.size) return undefined;
    this.stopped = false;
    const operation = { id: this.nextOperation++, action } satisfies KtcAutoBuildActiveOperation;
    this.activeOperation = operation;
    this.companionPendingAction = action;
    this.touchCompanion();
    this.log(`action received: ${action}`);
    return operation;
  }

  private async runDetachedExecutionOperation(
    operation: KtcAutoBuildActiveOperation,
    preparingText: string,
    execute: () => Promise<void>,
  ): Promise<boolean> {
    return this.sessionContext.exit(async () => {
      try {
        await this.status("in_progress", preparingText);
        await execute();
        return true;
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        this.log(`ERROR ${text}`, true);
        await this.status("error", text);
        return true;
      } finally {
        if (this.activeOperation?.id === operation.id) {
          this.activeOperation = undefined;
          this.resumeExecutionState = false;
          if (this.companionPendingAction === operation.action) this.companionPendingAction = undefined;
          this.touchCompanion();
        }
      }
    });
  }

  private requestCurrentConfiguration(
    context: KtcAutoBuildSessionContext,
    action: KtcAutoBuildDraftRequestAction,
  ): Promise<KtcAutoBuildConfiguration | undefined> {
    if (!this.isLiveSession(context) || !this.companionDocumentId) return Promise.resolve(undefined);
    this.cancelConfigurationRequest();
    const requestId = `${context.sessionId}-draft-${this.nextConfigurationRequest++}`;
    const documentId = this.companionDocumentId;
    const minimumDraftRevision = this.companionDraftRevision;
    let resolveRequest = (_configuration: KtcAutoBuildConfiguration | undefined): void => undefined;
    const result = new Promise<KtcAutoBuildConfiguration | undefined>((resolve) => { resolveRequest = resolve; });
    const timer = setTimeout(() => {
      if (this.pendingConfigurationRequest?.requestId !== requestId) return;
      this.pendingConfigurationRequest = undefined;
      resolveRequest(undefined);
    }, 2_500);
    this.pendingConfigurationRequest = { requestId, documentId, minimumDraftRevision, resolve: resolveRequest, timer };
    void context.panel.webview.postMessage({
      type: "requestConfiguration",
      requestId,
      documentId,
      minimumDraftRevision,
      action,
    }).then((posted) => {
      if (posted || this.pendingConfigurationRequest?.requestId !== requestId) return;
      this.cancelConfigurationRequest();
    });
    return result;
  }

  private acceptConfigurationSnapshot(message: KtcAutoBuildConfigurationSnapshotMessage): void {
    const pending = this.pendingConfigurationRequest;
    if (!pending
      || message.requestId !== pending.requestId
      || message.documentId !== pending.documentId
      || message.documentId !== this.companionDocumentId
      || message.draftRevision < pending.minimumDraftRevision
      || !ktcIsAutoBuildConfiguration(message.configuration)) return;
    const configuration = message.draftRevision < this.companionDraftRevision && this.companionConfiguration
      ? ktcCloneAutoBuildConfiguration(this.companionConfiguration)
      : ktcCloneAutoBuildConfiguration(message.configuration);
    if (message.draftRevision >= this.companionDraftRevision
      && !this.acceptDraft(message.documentId, message.draftRevision, configuration, true)) {
      clearTimeout(pending.timer);
      this.pendingConfigurationRequest = undefined;
      pending.resolve(undefined);
      return;
    }
    clearTimeout(pending.timer);
    this.pendingConfigurationRequest = undefined;
    pending.resolve(ktcCloneAutoBuildConfiguration(this.companionConfiguration ?? configuration));
  }

  private acceptDraft(
    documentId: string,
    draftRevision: number,
    configuration: unknown,
    acceptSameRevision = false,
  ): boolean {
    if (documentId !== this.companionDocumentId
      || !Number.isSafeInteger(draftRevision)
      || draftRevision < 0
      || draftRevision < this.companionDraftRevision
      || !ktcIsAutoBuildConfiguration(configuration)) return false;
    const next = this.withoutLegacyAutomaticCleanup(configuration);
    if (draftRevision === this.companionDraftRevision) {
      return acceptSameRevision
        && !!this.companionConfiguration
        && isDeepStrictEqual(next, this.companionConfiguration);
    }
    const preservesCleanupPreview = !!this.companionConfiguration
      && isDeepStrictEqual(next, this.companionConfiguration);
    if (!preservesCleanupPreview) {
      this.cleanupYamlWorkspace.invalidate();
      this.cleanupYamlContext++;
      this.cleanupYamlNotice = "配置已变化，请重新打开清理或探测配置。";
    }
    this.companionDraftRevision = draftRevision;
    this.companionConfiguration = next;
    if (this.frozenCleanup) {
      if (preservesCleanupPreview && this.frozenCleanup.documentId === documentId) {
        this.frozenCleanup = { ...this.frozenCleanup, draftRevision };
      } else {
        this.frozenCleanup = undefined;
        this.cleanupState = {
          ...this.cleanupState,
          preview: { state: "idle", message: "配置已变化，请重新预览。", items: [] },
        };
      }
    }
    this.reconcileWorkingDirectoryContext(next);
    this.touchCompanion();
    return true;
  }

  private isCurrentDraftContext(context: KtcAutoBuildDraftContext): boolean {
    return context.documentId === this.companionDocumentId
      && context.draftRevision === this.companionDraftRevision;
  }

  private cancelConfigurationRequest(): void {
    const pending = this.pendingConfigurationRequest;
    if (!pending) return;
    this.pendingConfigurationRequest = undefined;
    clearTimeout(pending.timer);
    pending.resolve(undefined);
  }
  private async handle(message: Message): Promise<void> {
    if (message.type === "ready") {
      const retainedDraft = (this.companionDocumentId || this.resumeViewState || this.resumeExecutionState)
        ? this.companionConfiguration
        : undefined;
      this.cancelConfigurationRequest();
      this.companionDocumentId = message.documentId;
      this.companionDraftRevision = 0;
      this.companionReady = false;
      this.touchCompanion();
      if (retainedDraft) {
        if (this.processes.size) {
          this.companionStatus = "running";
          this.companionMessage = this.stopped
            ? "正在停止之前启动的任务…"
            : "之前启动的任务仍在运行；可从 Primary 或 Right 停止。";
        }
        this.resumeExecutionState = false;
        this.resumeViewState = false;
        await this.postRestoredRightState(retainedDraft);
        if (!this.isLiveHandler()) return;
        this.companionReady = true;
        this.touchCompanion();
        return;
      }
      const environment = await ktcReadProjectEnvironment();
      if (!this.isLiveHandler()) return;
      this.detectedRootDirectory = environment.values.find((value) => value.key === "customRoot")?.value || process.env.ROOT_DIR || "";
      this.detectedThirdPartyDirectory = environment.values.find((value) => value.key === "thirdPartyRoot")?.value || process.env.ROOT_DIR_3rdParty || "";
      const configuration = this.createFreshConfiguration();
      this.currentPath = "";
      this.loadedConfiguration = false;
      this.workingDirectoryBaseline = configuration.workingDirectory?.trim() || "";
      this.workingDirectoryMismatch = false;
      this.persistedConfigurationFingerprint = this.configurationFingerprint(configuration);
      await this.post({ type: "configuration", configuration, detectedRootDirectory: this.detectedRootDirectory, path: "", recentPaths: this.workspaceState.get<string[]>(RECENT_KEY) || [], platform: process.platform });
      await this.postScriptStatus();
      if (!this.isLiveHandler()) return;
      this.companionReady = true;
      this.touchCompanion();
      return;
    }
    if (message.type === "stop") {
      const cancelledRequest = !!this.pendingConfigurationRequest;
      const pendingExecution = this.companionPendingAction === "preflight"
        || this.companionPendingAction === "start"
        || this.companionPendingAction === "runProject"
        || this.companionPendingAction === "updateProject"
        || this.companionPendingAction === "runTask"
        || this.companionPendingAction === "cleanupDialog";
      this.stopped = true;
      this.gitUpdateAbortController?.abort();
      this.cancelConfigurationRequest();
      if (!this.processes.size) {
        this.log(cancelledRequest || pendingExecution ? "pending execution cancelled" : "stop: no process", true);
        await this.status("idle", cancelledRequest || pendingExecution ? "已取消尚未启动的操作。" : "当前没有运行中的任务。");
      } else {
        this.log("stop requested", true);
        this.stopTaskProcesses();
      }
      return;
    }
    if (message.type === "selectRecent" && message.path) {
      if (!await this.confirmDiscardChanges()) return;
      await this.load(message.path);
      return;
    }
    if (message.type === "open") {
      if (!await this.confirmDiscardChanges()) return;
      await this.openConfigurationFromDialog();
      return;
    }
    if (message.type === "syncRootScript") {
      const root = this.detectedRootDirectory;
      if (!root) throw new Error("未探测到当前 ROOT_DIR。");
      if (!ktcCanAccessAutoBuildPathOnHost(root, process.platform)) {
        throw new Error("当前 ROOT_DIR 不是本机原生绝对路径，未执行同步；请修正路径，或使用“导出 PS1”选择本机位置。");
      }
      if (ktcIsAutoBuildFilesystemRoot(root)) throw new Error("不允许把同步目标设为文件系统根目录。");
      const copied = await ktcSyncAutoBuildScripts(this.extensionUri.fsPath, root);
      copied.forEach(({ operation, target }) => {
        this.log(`${operation === "replace" ? "替换" : "新建"} ${target}`);
      });
      this.output.show(true);
      await this.postScriptStatus();
      await this.status("done", `已同步 ${copied.length} 个文件到 ROOT/tools 与 ROOT/sample${this.nonWindowsScriptNote()}`);
      return;
    }
    if (message.type === "exportLauncher") { const configuration = message.configuration; this.assertWorkingDirectoryContext(configuration); const errors = ktcValidateAutoBuildConfiguration(configuration); if (errors.length) throw new Error(errors.join("\n")); const working = configuration.workingDirectory?.trim(); if (!working) throw new Error("请先填写当前工作目录。"); let target = ktcJoinAutoBuildPath(working, "Invoke-AutoBuild.local.ps1"); if (!ktcCanAccessAutoBuildPathOnHost(target, process.platform)) { if (process.platform === "win32") throw new Error("当前工作目录不是 Windows 盘符或 UNC 共享根路径，未导出脚本。"); const selected = await vscode.window.showSaveDialog({ title: "当前配置使用 Windows 路径，请选择本机 PS1 保存位置", saveLabel: "保存 PS1", filters: { "PowerShell": ["ps1"] } }); if (!this.isLiveHandler()) return; if (!selected) { await this.status("idle", "已取消导出，未写入文件。"); return; } target = selected.fsPath; } if (!this.isLiveHandler()) return; const toolRoot = ktcCanAccessAutoBuildPathOnHost(this.detectedRootDirectory, "win32") ? this.detectedRootDirectory : configuration.rootDirectory; await writeFile(target, `\uFEFF${ktcCreateAutoBuildLauncher(configuration, toolRoot)}`, "utf8"); if (!this.isLiveHandler()) return; this.log(`已导出脱离 UI 的构建脚本：${target}`, true); await this.status("done", `已导出：${target}${this.nonWindowsScriptNote()}`); return; }
    if (message.type === "pickScriptTargetDirectory") { const uri = (await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: message.targetDirectory?.trim() ? vscode.Uri.file(message.targetDirectory.trim()) : undefined, title: "选择脚本输出目录" }))?.[0]; if (uri) await this.post({ type: "scriptTargetDirectory", value: uri.fsPath }); return; }
    if (message.type === "writeScript") {
      this.assertWorkingDirectoryContext(message.configuration);
      const directory = message.scriptKind === "manifest" ? (message.manifestTarget === "root" ? message.configuration.rootDirectory.trim() : message.configuration.workingDirectory?.trim() || "") : message.targetDirectory.trim() || message.configuration.workingDirectory?.trim() || "";
      if (!directory) throw new Error("请填写脚本输出目录。");
      if (!ktcCanAccessAutoBuildPathOnHost(directory, process.platform)) throw new Error("脚本输出目录不是当前系统可访问的绝对路径。");
      let source: string, name: string;
      if (message.scriptKind === "build") {
        source = ktcCreateAutoBuildLauncher(message.configuration, this.detectedRootDirectory);
        name = "Invoke-AutoBuild.local.ps1";
      } else if (message.scriptKind === "checkout") {
        message.configuration.repositorySnapshot = await this.probeRepositories(message.configuration);
        if (!this.isLiveHandler()) return;
        if (!message.configuration.repositorySnapshot.repositories.some((item) => !item.error && item.origin && item.origin !== "(无 origin)")) throw new Error("没有探测到可写入检出脚本的 Git 仓库。");
        source = ktcCreateRepositoryCheckoutScript(message.configuration, message.checkoutOptions);
        name = "Checkout-AutoBuildRepositories.ps1";
        await this.post({ type: "repositorySnapshot", snapshot: message.configuration.repositorySnapshot });
      } else {
        message.configuration.repositorySnapshot = await this.probeRepositories(message.configuration);
        if (!this.isLiveHandler()) return;
        name = "BUILD_MANIFEST.json";
        const target = ktcJoinAutoBuildPath(directory, name), mode = message.manifestMode || "overwrite";
        let previous;
        if (mode === "merge") { try { previous = ktcParseBuildManifest(await readFile(target, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
        if (!this.isLiveHandler()) return;
        source = JSON.stringify(ktcCreateBuildManifest(message.configuration, previous), null, 2) + "\n";
        const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, source, "utf8"); await rename(temporary, target);
        await this.post({ type: "repositorySnapshot", snapshot: message.configuration.repositorySnapshot });
        this.log(`已${mode === "merge" ? "追加或更新" : "覆盖"}版本归档：${vscode.Uri.file(target).toString()}`, true);
        await this.status("done", `已写入：${target}`); await this.post({ type: "scriptWritten", path: target }); return;
      }
      const target = ktcJoinAutoBuildPath(directory, name);
      if (!this.isLiveHandler()) return;
      await writeFile(target, `\uFEFF${source}`, "utf8");
      if (!this.isLiveHandler()) return;
      this.log(`已写入脚本：${vscode.Uri.file(target).toString()}`, true);
      await this.status("done", `已写入：${target}`);
      await this.post({ type: "scriptWritten", path: target });
      return;
    }
    if (!ktcIsAutoBuildConfiguration(message.configuration)) throw new Error("右侧配置数据无效，请重新打开编译工具。");
    const configuration = this.withoutLegacyAutomaticCleanup(message.configuration);
    if (this.isPathSensitiveAction(message.type)) this.assertWorkingDirectoryContext(configuration);
    if (message.type === "pickProjectDirectories") {
      const working = configuration.workingDirectory?.trim() || "";
      const defaultUri = working && ktcCanAccessAutoBuildPathOnHost(working, process.platform) ? vscode.Uri.file(working) : undefined;
      const uris = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: true, defaultUri, title: "选择一个或多个仓库/构建目录" });
      if (!this.isLiveHandler() || !this.isCurrentDraftContext(message)) return;
      if (uris?.length) await this.addProjectDirectories(configuration, uris.map((uri) => uri.fsPath), false, message);
      return;
    }
    if (message.type === "discoverProjectDirectories") {
      const root = configuration.workingDirectory?.trim();
      if (!root) throw new Error("请先填写工作目录。");
      if (!ktcCanAccessAutoBuildPathOnHost(root, process.platform)) throw new Error("当前工作目录不是本机原生绝对路径，未执行目录扫描。");
      const paths = await this.discoverGitDirectories(root);
      if (!this.isLiveHandler() || !this.isCurrentDraftContext(message)) return;
      await this.addProjectDirectories(configuration, paths, true, message);
      return;
    }
    if (message.type === "probeProject") {
      const index = configuration.projects.findIndex((project) => project.id === message.projectId);
      if (index < 0) throw new Error("项目行已变化，请重新探测。");
      const project = await this.probeProjectRow(configuration.projects[index]!, configuration.workingDirectory || "");
      if (!this.isLiveHandler() || !this.isCurrentDraftContext(message)) return;
      configuration.projects[index] = project;
      await this.workspaceState.update(STATE_KEY, configuration);
      if (!this.isLiveHandler() || !this.isCurrentDraftContext(message)) return;
      await this.post({ type: "projectProbe", documentId: message.documentId, draftRevision: message.draftRevision, projectId: message.projectId, probe: project.probe });
      return;
    }
    if (message.type === "updateProject") { await this.updateProject(configuration, message.projectId, message); return; }
    if (message.type === "runProject") { await this.runProject(configuration, message.projectId, message); return; }
    if (message.type === "save" || message.type === "saveAs") { await this.save(configuration, message.type === "saveAs"); return; }
    if (message.type !== "preflight" && message.type !== "start" && message.type !== "runTask") return;
    const responseContext: KtcAutoBuildDraftContext = message;
    const errors = ktcValidateAutoBuildConfiguration(configuration);
    errors.forEach((error) => this.log(`预检失败：${error}`)); if (errors.length) { this.output.show(true); await this.status("error", errors.join("\n")); return; }
    if (!this.activeOperation && !this.isCurrentDraftContext(responseContext)) { await this.status("idle", "配置已更改；未按旧配置执行。"); return; }
    const plannedTasks = ktcPlanAutoBuildTasks(configuration);
    if (message.type === "runTask") {
      if (this.processes.size) { await this.status("in_progress", "已有任务进行中。"); return; }
      const previous = this.tasks.find((task) => task.id === message.taskId);
      const planned = previous
        ? plannedTasks.find((task) => ktcAutoBuildTaskSessionKey(task) === ktcAutoBuildTaskSessionKey(previous))
        : plannedTasks.find((task) => task.id === message.taskId);
      if (!planned) { await this.status("error", "未找到所选任务，请重新预检。"); return; }
      this.tasks = ktcUpsertAutoBuildSessionTasks(this.tasks, [planned]);
      const task = this.tasks.find((candidate) => ktcAutoBuildTaskSessionKey(candidate) === ktcAutoBuildTaskSessionKey(planned))!;
      if (task.phase === "repository" && configuration.clean && await vscode.window.showWarningMessage("该仓库任务将执行清理。是否继续？", { modal: true }, "清理并运行") !== "清理并运行") { if (!this.isLiveHandler()) return; await this.status("idle", "已取消。"); return; }
      if (!this.isLiveHandler() || this.stopped) { await this.status("idle", "操作已停止；未启动所选任务。"); return; }
      // Explicit retries use the current configuration, not a previous batch's dependency failures.
      this.failedRepositoryPaths.clear();
      task.status = "in_progress";
      task.children?.forEach((child) => { child.status = "in_progress"; });
      await this.post({ type: "tasks", tasks: this.tasks });
      const script = vscode.Uri.joinPath(this.extensionUri, "scripts", "auto-build", "Invoke-AutoBuild.ps1").fsPath;
      const code = await this.runProcess(task, this.taskArguments(task, configuration, script), configuration);
      if (!this.isLiveHandler()) return;
      const outcome = this.completeTaskRun(task, code);
      await this.post({ type: "tasks", tasks: this.tasks });
      if (code === 0 && task.phase === "repository") await this.refreshRepositorySnapshot(configuration, responseContext);
      const resultText = outcome === "cancelled" ? `${task.name} 已取消。`
        : outcome === "skipped" ? `${task.name} 已跳过，请查看 Output。`
        : code === 0 ? `${task.name} 完成。` : `${task.name} 失败，请查看 Output。`;
      this.log(resultText, true);
      await this.status(outcome === "cancelled" ? "idle" : code === 0 ? "done" : "error", resultText);
      return;
    }
    const probedProjects = await Promise.all(configuration.projects.map((project) => this.probeProjectRow(project, configuration.workingDirectory || "")));
    if (!this.isLiveHandler()) return;
    configuration.projects = probedProjects;
    if (this.isCurrentDraftContext(responseContext)) {
      await this.post({ type: "projects", mode: "probe", documentId: responseContext.documentId, draftRevision: responseContext.draftRevision, projects: configuration.projects });
      if (this.isCurrentDraftContext(responseContext)) await this.workspaceState.update(STATE_KEY, configuration);
    }
    if (!this.isLiveHandler()) return;
    const selected = ktcSelectAutoBuildProjects(configuration);
    this.log(`配置摘要：Root=${configuration.rootDirectory}; RootBranch=${configuration.rootBranch}; 3rdParty=${configuration.thirdPartyDirectory}; Branch=${configuration.branch}; 项目=${configuration.projects.length}; CMake=${selected.cmakeProjectPaths.length}; CAA=${selected.caaProjectPaths.length}; Clean=${configuration.clean}`);
    const summary = `本地预检通过：ROOT_DIR (${configuration.rootBranch})；ROOT_DIR_3rdParty (${configuration.branch})；启用项目 ${configuration.projects.filter((project) => project.enabled).length} 个；CMake ${selected.cmakeProjectPaths.length} 个；CAA ${selected.caaProjectPaths.length} 个。`; this.log(summary, true);
    if (message.type === "preflight") {
      const retainedOutcomes = this.tasks.some((task) => task.status === "done" || task.status === "error");
      this.tasks = ktcReconcileAutoBuildTaskPlan(this.tasks, plannedTasks);
      await this.post({ type: "tasks", tasks: this.tasks });
      await this.refreshRepositorySnapshot(configuration, responseContext);
      await this.status("done", `${summary}${retainedOutcomes ? " 已保留相同任务的已有完成/失败结果。" : ""}`);
      return;
    }
    if (this.processes.size) { await this.status("in_progress", "已有任务进行中。"); return; }
    const script = vscode.Uri.joinPath(this.extensionUri, "scripts", "auto-build", "Invoke-AutoBuild.ps1").fsPath;
    if (configuration.clean && await vscode.window.showWarningMessage("仅清理 ROOT_DIR、ROOT_DIR_3rdParty 和 CMake 仓库；不会清理 CAA/附加仓库。是否继续？", { modal: true }, "清理并启动") !== "清理并启动") { if (!this.isLiveHandler()) return; await this.status("idle", "已取消。"); return; }
    if (!this.isLiveHandler()) return;
    this.tasks = plannedTasks;
    await this.post({ type: "tasks", tasks: this.tasks });
    const commands = this.tasks.map((task) => this.taskArguments(task, configuration, script));
    this.log("运行时：Git / CMake 使用 TypeScript；Windows link / export / CAA 保留 PowerShell。"); this.stopped = false; await this.status("in_progress", "进行中（In progress）");
    const runOne = async (task: KtcAutoBuildTask): Promise<number> => {
      if (!this.isLiveHandler() || this.stopped) { task.status = "cancelled"; return -1; }
      const index = this.tasks.indexOf(task);
      task.status = "in_progress";
      task.children?.forEach((child) => { child.status = "in_progress"; });
      await this.post({ type: "tasks", tasks: this.tasks });
      const code = await this.runProcess(task, commands[index]!, configuration);
      if (!this.isLiveHandler()) return -1;
      this.completeTaskRun(task, code);
      await this.post({ type: "tasks", tasks: this.tasks });
      return code;
    };
    const repositoryTask = this.tasks.find((task) => task.phase === "repository")!;
    await runOne(repositoryTask);
    await this.refreshRepositorySnapshot(configuration, responseContext);
    for (const task of this.tasks.filter((item) => item.phase === "link")) await runOne(task);
    await Promise.all(this.tasks.filter((item) => item.phase === "export").map(runOne));
    const buildTasks = this.tasks.filter((task) => task.phase === "cmake" || task.phase === "caa");
    if (configuration.buildExecutionMode === "parallel" && process.platform === "win32") await Promise.all(buildTasks.map(runOne));
    else {
      if (configuration.buildExecutionMode === "parallel") this.log("当前非 Windows 运行按顺序编译 CMake；保留配置中的并行选择供 Windows 使用。");
      for (const task of buildTasks) await runOne(task);
    }
    const failed = this.tasks.filter((task) => task.status === "error");
    const skipped = this.tasks.filter((task) => task.status === "skipped");
    const summaryText = this.stopped ? "已停止。" : `执行结束：${failed.length} 个失败，${skipped.length} 个跳过${skipped.length ? "（含未执行的步骤，请查看 Output）" : ""}。`;
    this.log(summaryText, true);
    await this.status(this.stopped || failed.length ? "error" : "done", summaryText);
  }
  private async runCleanupYamlAction(
    configuration: KtcAutoBuildConfiguration,
    payload: Extract<KtcAutoBuildCleanupDialogPayload, { kind: "yaml-discover" | "yaml-open-source" | "yaml-clean-source" }>,
  ): Promise<void> {
    this.assertWorkingDirectoryContext(configuration);
    const context = this.cleanupYamlContext;
    const documentId = this.companionDocumentId;
    const fingerprint = this.configurationFingerprint(configuration);
    const shouldContinue = (): boolean => this.isLiveHandler() && !this.stopped && !this.cleanupCancelled
      && context === this.cleanupYamlContext && documentId === this.companionDocumentId
      && !!this.companionConfiguration && fingerprint === this.configurationFingerprint(this.companionConfiguration);
    const assertCurrent = (): void => { if (!shouldContinue()) throw new Error("YAML 清理上下文已变化或已关闭，请重新打开。"); };
    try {
      assertCurrent();
      if (payload.kind === "yaml-discover") {
        const working = ktcAutoBuildCleanupDirectory(configuration.workingDirectory, this.defaultWorkingDirectory);
        if (!working) throw new Error("未传入工作目录，请先选择目录，再探测 cleanup.yaml。");
        // Discovery belongs to the current work directory, not the build dependencies.
        // Never expand to ROOT_DIR, third-party roots or external project paths.
        this.cleanupYamlNotice = "正在探测当前工作目录及其子目录中的 cleanup.yaml…";
        this.log(`[YAML 探测] 范围：${working}（仅当前工作目录及其子目录）`);
        this.touchCompanion();
        const sources = await this.cleanupYamlWorkspace.discover([working], { shouldContinue });
        assertCurrent();
        this.cleanupYamlConfigurationFingerprint = fingerprint;
        this.cleanupYamlNotice = `发现 ${sources.length} 份 cleanup.yaml；每份仅清理所在目录的直属项。`
          + (this.cleanupYamlWorkspace.warnings.length ? " 探测有跳过项，详情见日志。" : "");
        this.log(this.cleanupYamlNotice);
        for (const warning of this.cleanupYamlWorkspace.warnings) this.log(`[YAML 探测] ${warning}`);
      } else if (payload.kind === "yaml-open-source") {
        if (fingerprint !== this.cleanupYamlConfigurationFingerprint) throw new Error("编译配置已变化，请重新探测清理配置。");
        const source = await this.cleanupYamlWorkspace.readForOpen(payload.sourceId);
        assertCurrent();
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(source.path));
        assertCurrent();
        await vscode.window.showTextDocument(document, { preview: true });
        assertCurrent();
        this.cleanupYamlNotice = `已打开 ${source.path}；请在 VS Code 中编辑、保存后重新探测。`;
      } else {
        if (fingerprint !== this.cleanupYamlConfigurationFingerprint) throw new Error("编译配置已变化，请重新探测清理配置。");
        this.frozenCleanup = undefined;
        this.cleanupState = { ...this.cleanupState, preview: { state: "executing", message: "正在核对已保存 YAML 并清理其直属命中项…", items: [] } };
        this.touchCompanion();
        const result = await this.cleanupYamlWorkspace.clean(payload.sourceId, payload.revision, {
          shouldContinue,
          isDirty: (path) => vscode.workspace.textDocuments.some((doc) => doc.isDirty
            && doc.uri.scheme === "file" && (process.platform === "win32"
              ? doc.uri.fsPath.toLocaleLowerCase() === path.toLocaleLowerCase() : doc.uri.fsPath === path)),
        });
        assertCurrent();
        this.cleanupYamlNotice = `${result.source.path}：${result.status}；已删除内容不会自动恢复。`;
        this.cleanupState = { ...this.cleanupState, preview: { state: "complete", summary: result.status,
          message: this.cleanupYamlNotice, items: result.deleted } };
        for (const path of result.deleted) this.log(`YAML 清理 · 删除 ${path}`);
        this.log(this.cleanupYamlNotice);
        this.companionStatus = "done";
        this.companionMessage = result.status;
      }
      this.touchCompanion();
    } catch (error) {
      if (!this.isLiveHandler()) return;
      if (this.cleanupCancelled || this.stopped || context !== this.cleanupYamlContext) return;
      const message = error instanceof Error ? error.message : String(error);
      this.cleanupYamlNotice = message;
      if (payload.kind === "yaml-clean-source") {
        this.cleanupState = { ...this.cleanupState, preview: { state: "error", message, items: [] } };
      }
      this.touchCompanion();
      throw error;
    }
  }

  private async previewCleanupDialog(
    configuration: KtcAutoBuildConfiguration,
    request: KtcAutoBuildCleanupDialogRequest,
  ): Promise<void> {
    this.assertWorkingDirectoryContext(configuration);
    const effective = this.withoutLegacyAutomaticCleanup(configuration);
    if (request.modeId === "rules") await this.updateRootCleanupYaml(request.rulesYaml);
    const currentConfiguration = this.companionConfiguration ?? effective;
    this.frozenCleanup = undefined;
    this.cleanupState = {
      selectedModeId: request.modeId,
      selectedTargetIds: request.targetIds,
      rulesYaml: request.rulesYaml,
      preview: { state: "loading", message: "正在读取并冻结实际命中…", items: [] },
    };
    this.touchCompanion();
    try {
      const model = ktcCreateAutoBuildCleanupViewModel({
        configuration: currentConfiguration,
        defaultWorkingDirectory: this.defaultWorkingDirectory,
        platform: process.platform,
        enabled: true,
        state: this.cleanupState,
      });
      const targetsById = new Map(model.targets.map((target) => [target.id, target]));
      const selectedTargets = request.targetIds.map((targetId) => {
        const target = targetsById.get(targetId);
        if (!target || target.disabled || !target.supportedModeIds?.includes(request.modeId)) {
          throw new Error(`清理目标已失效或不支持当前方式：${targetId}`);
        }
        return target;
      });
      const frozen: KtcAutoBuildFrozenCleanupTarget[] = [];
      const items: string[] = [];
      for (const target of selectedTargets) {
        if (!this.isLiveHandler() || this.stopped || this.cleanupCancelled) throw new Error("清理预览已停止。");
        if (request.modeId === "git-force") {
          const preview = await ktcPreviewWingGitForcedCleanup(target.path);
          frozen.push({ kind: "git-force", targetId: target.id, label: target.label, preview });
          for (const change of preview.trackedChanges) items.push(`[${target.label}] 已跟踪 · ${change}`);
          for (const change of preview.untrackedAndIgnored) items.push(`[${target.label}] 未跟踪/忽略 · ${change}`);
          if (!preview.trackedChanges.length && !preview.untrackedAndIgnored.length) {
            items.push(`[${target.label}] 工作树已干净`);
          }
          continue;
        }
        if (request.modeId === "cmake" && target.id === "cmake:shared") {
          try { await access(target.path); }
          catch {
            items.push(`[${target.label}] 目录不存在，无需清理`);
            continue;
          }
          const preview = await ktcPreviewWingDirectoryContents(target.path);
          frozen.push({ kind: "directory-contents", targetId: target.id, label: target.label, preview });
          if (!preview.matched.length) items.push(`[${target.label}] 目录为空`);
          for (const path of preview.matched) items.push(`[${target.label}] ${path}`);
          continue;
        }
        const preview = request.modeId === "cmake"
          ? await ktcPreviewWingCleanupArtifacts(
            dirname(target.path),
            "delete:\n  directories:\n    - build\n  files: []",
          )
          : await ktcPreviewWingCleanupArtifacts(target.path, request.rulesYaml);
        frozen.push({ kind: "artifacts", targetId: target.id, label: target.label, preview });
        if (!preview.matched.length) items.push(`[${target.label}] 没有命中`);
        for (const path of preview.matched) items.push(`[${target.label}] ${path}`);
      }
      if (!this.isLiveHandler() || this.stopped || this.cleanupCancelled) throw new Error("清理预览已停止。");
      const token = randomUUID();
      this.frozenCleanup = {
        token,
        documentId: this.companionDocumentId,
        draftRevision: this.companionDraftRevision,
        request,
        targets: Object.freeze(frozen),
      };
      this.cleanupState = {
        ...this.cleanupState,
        preview: {
          state: "ready",
          token,
          summary: `${selectedTargets.length} 个目标 · ${items.length} 条预览`,
          message: "已冻结当前命中；执行时会再次验证文件、目录与仓库状态。",
          items: Object.freeze(items),
        },
      };
      this.log(`清理预览：${request.modeId} · ${selectedTargets.length} 个目标 · ${items.length} 条`);
      this.touchCompanion();
    } catch (error) {
      if (this.cleanupCancelled || this.stopped) {
        this.finishCancelledCleanup([]);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.frozenCleanup = undefined;
      this.cleanupState = {
        ...this.cleanupState,
        preview: { state: "error", message, items: [] },
      };
      this.touchCompanion();
      throw error;
    }
  }

  private async executeCleanupDialog(
    request: KtcAutoBuildCleanupDialogRequest,
    previewToken: string,
  ): Promise<void> {
    const frozen = this.frozenCleanup;
    if (!frozen
      || frozen.token !== previewToken
      || frozen.documentId !== this.companionDocumentId
      || frozen.draftRevision !== this.companionDraftRevision
      || !isDeepStrictEqual(frozen.request, request)) {
      throw new Error("清理预览已过期，请重新预览后再执行。");
    }
    this.cleanupState = {
      ...this.cleanupState,
      preview: {
        state: "executing",
        message: "正在验证并执行冻结的清理结果…",
        items: this.cleanupState.preview?.items ?? [],
      },
    };
    this.touchCompanion();
    const results: string[] = [];
    try {
      for (const target of frozen.targets) {
        const shouldContinue = (): boolean => this.isLiveHandler() && !this.stopped && !this.cleanupCancelled;
        if (!shouldContinue()) throw new Error("清理执行已停止。");
        if (target.kind === "git-force") {
          const result = await ktcExecuteWingGitForcedCleanup(target.preview, { shouldContinue });
          const summary = `${target.label} · Git 恢复 ${result.repository}`;
          results.push(summary);
          this.log(summary);
          continue;
        }
        const result = target.kind === "directory-contents"
          ? await ktcCleanPreviewedWingDirectoryContents(target.preview, { shouldContinue })
          : await ktcCleanPreviewedWingArtifacts(target.preview, { shouldContinue });
        if (!result.deleted.length) {
          const summary = `${target.label} · 无需清理`;
          results.push(summary);
          this.log(summary);
          continue;
        }
        for (const path of result.deleted) {
          const summary = `${target.label} · 删除 ${path}`;
          results.push(summary);
          this.log(summary);
        }
      }
      if (this.cleanupCancelled || this.stopped) throw new Error("清理执行已停止。");
      this.frozenCleanup = undefined;
      this.cleanupState = {
        ...this.cleanupState,
        preview: {
          state: "complete",
          summary: `${frozen.targets.length} 个目标已处理`,
          message: "清理完成。",
          items: Object.freeze(results),
        },
      };
      this.companionStatus = "done";
      this.companionMessage = "清理完成。";
      this.touchCompanion();
    } catch (error) {
      if (this.cleanupCancelled || this.stopped) {
        this.log(error instanceof Error ? error.message : String(error));
        this.finishCancelledCleanup(results);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.frozenCleanup = undefined;
      this.cleanupState = {
        ...this.cleanupState,
        preview: { state: "error", message, items: Object.freeze(results) },
      };
      this.touchCompanion();
      throw error;
    }
  }

  private cancelCleanupDialog(): void {
    const pending = this.companionPendingAction === "cleanupDialog";
    const executing = this.cleanupState.preview?.state === "executing";
    this.cleanupCancelled = true;
    this.cleanupYamlWorkspace.invalidate();
    this.cleanupYamlContext++;
    this.frozenCleanup = undefined;
    if (pending) this.cancelConfigurationRequest();
    const message = executing
      ? "已请求停止清理；已删除内容不会恢复，不再处理后续项。"
      : "已取消清理预览；冻结结果已失效，未启动新的删除。";
    this.cleanupState = {
      ...this.cleanupState,
      preview: { state: "idle", message, items: [] },
    };
    // Closing an idle cleanup dialog must not change an unrelated build task.
    if (pending || this.companionStatus !== "running") {
      this.companionStatus = "idle";
      this.companionMessage = message;
    }
    this.log(message);
    this.touchCompanion();
  }

  private finishCancelledCleanup(results: readonly string[]): void {
    if (!this.isLiveHandler()) return;
    this.frozenCleanup = undefined;
    const message = "清理已取消；已删除内容不会恢复，未继续处理后续项。";
    this.cleanupState = {
      ...this.cleanupState,
      preview: { state: "idle", message, items: Object.freeze([...results]) },
    };
    this.companionStatus = "idle";
    this.companionMessage = message;
    this.log(message);
    this.touchCompanion();
  }

  private async addProjectDirectories(configuration: KtcAutoBuildConfiguration, paths: string[], deduplicateOrigin: boolean, responseContext: KtcAutoBuildDraftContext): Promise<void> {
    const working = configuration.workingDirectory || "", rows = [...configuration.projects], known = new Set(rows.map((row) => ktcResolveAutoBuildPath(row.path, working).toLocaleLowerCase()));
    const probedPaths = new Set(paths.map((path) => path.toLocaleLowerCase()));
    for (const path of paths) {
      let isGit = true; try { await execFileAsync("git", ["-C", path, "rev-parse", "--show-toplevel"], { encoding: "utf8" }); } catch { isGit = false; }
      const key = path.toLocaleLowerCase(); if (known.has(key)) continue; known.add(key);
      const row = ktcCreateAutoBuildProjectRow(path, working, rows.length), has = async (name: string) => { try { await access(ktcJoinAutoBuildPath(path, name)); return true; } catch { return false; } };
      const hasMk = await has("mk.ps1"), hasCmake = await has("CMakeLists.txt"), isCaa = hasMk && !hasCmake, hasLink = await has("linkCAA.ps1"), hasLinkOut = await has("linkOut") || await has("linkOut.ps1");
      row.operations = { update: isGit, cmake: hasCmake, caa: isCaa, linkCaa: isCaa || hasLink || hasLinkOut }; rows.push(row);
    }
    const probed = await Promise.all(rows.map(async (row) => {
      if (!probedPaths.has(ktcResolveAutoBuildPath(row.path, working).toLocaleLowerCase())) return row;
      const refreshed = await this.probeProjectRow(row, working), detectedBranch = refreshed.probe?.branch;
      return detectedBranch && detectedBranch !== "(detached)" ? { ...refreshed, branch: detectedBranch } : refreshed;
    }));
    if (!this.isLiveHandler() || !this.isCurrentDraftContext(responseContext)) return;
    configuration.projects = deduplicateOrigin ? ktcDeduplicateAutoBuildProjectsByOrigin(probed) : probed;
    await this.workspaceState.update(STATE_KEY, configuration);
    if (!this.isLiveHandler() || !this.isCurrentDraftContext(responseContext)) return;
    await this.post({ type: "projects", mode: "replace", documentId: responseContext.documentId, draftRevision: responseContext.draftRevision, projects: configuration.projects });
    await this.status("done", `项目表已更新：${configuration.projects.length} 行。`);
  }
  private async probeProjectRow(row: KtcAutoBuildProjectRow, working: string): Promise<KtcAutoBuildProjectRow> {
    const path = ktcResolveAutoBuildPath(row.path, working), capturedAt = new Date().toISOString();
    if (!ktcCanAccessAutoBuildPathOnHost(path, process.platform)) return { ...row, probe: { capturedAt, branch: "", commit: "", origin: "", status: "unknown", message: "当前项目是 Windows 路径，非 Windows 环境未访问本机文件系统。" } };
    try {
      const branch = (await execFileAsync("git", ["-C", path, "branch", "--show-current"], { encoding: "utf8" })).stdout.trim() || "(detached)", commit = (await execFileAsync("git", ["-C", path, "rev-parse", "HEAD"], { encoding: "utf8" })).stdout.trim();
      let status: "clean" | "modified" | "invalid" | "script-mismatch" | "unknown" = (await execFileAsync("git", ["-C", path, "status", "--porcelain=v1"], { encoding: "utf8" })).stdout.trim() ? "modified" : "clean", message = "", origin = "";
      try { origin = (await execFileAsync("git", ["-C", path, "remote", "get-url", "origin"], { encoding: "utf8" })).stdout.trim(); } catch { origin = "(无 origin)"; }
      if (row.operations.caa) { const mk = ktcJoinAutoBuildPath(path, "mk.ps1"); try { await access(mk); const source = await readFile(mk, "utf8"); if (/ROOT_DIR[\\/]+tools[\\/]+mk\.ps1/i.test(source)) { if (!this.detectedRootDirectory) { status = "script-mismatch"; message = "项目依赖 ROOT_DIR/tools/mk.ps1，但尚未探测到 Root。"; } else { const rootMk = ktcJoinAutoBuildPath(this.detectedRootDirectory, "tools", "mk.ps1"); if (!ktcCanAccessAutoBuildPathOnHost(rootMk, process.platform)) { status = "unknown"; message = "项目依赖 Windows ROOT_DIR/tools/mk.ps1，当前系统未访问该路径。"; } else { try { await access(rootMk); } catch { status = "script-mismatch"; message = "项目依赖 ROOT_DIR/tools/mk.ps1，但当前 Root 中不存在。"; } } } } } catch { status = "invalid"; message = "所选编译目录缺少 mk.ps1。"; } }
      return { ...row, branch: row.branch || branch, probe: { capturedAt, branch, commit, origin, status, ...(message ? { message } : {}) } };
    }
    catch (error) { return { ...row, probe: { capturedAt, branch: "", commit: "", origin: "", status: "not-git", message: error instanceof Error ? error.message.split(/\r?\n/, 1)[0] : String(error) } }; }
  }
  private async discoverGitDirectories(root: string): Promise<string[]> {
    const found: string[] = [], queue: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }], skipped = new Set([".git", "node_modules", "build", "objects", ".pnpm", "dist"]);
    while (queue.length && found.length < 200) { const current = queue.shift()!; let entries; try { entries = await readdir(current.path, { withFileTypes: true }); } catch { continue; } if (entries.some((entry) => entry.isDirectory() && entry.name === ".git")) { found.push(current.path); continue; } if (current.depth >= 5) continue; for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink() && !skipped.has(entry.name.toLocaleLowerCase())) queue.push({ path: ktcJoinAutoBuildPath(current.path, entry.name), depth: current.depth + 1 }); }
    return found;
  }
  private async runProject(configuration: KtcAutoBuildConfiguration, projectId: string, _responseContext: KtcAutoBuildDraftContext): Promise<void> {
    this.failedRepositoryPaths.clear();
    let selected = configuration.projects.find((project) => project.id === projectId);
    if (!selected) throw new Error("项目行已变化，请重新探测。");
    if (!selected.enabled) throw new Error("该项目未启用。");
    const preparationPlan: KtcAutoBuildTask = {
      id: `project-prepare-${selected.id}`,
      name: `项目准备 · ${selected.name}`,
      commandSummary: selected.operations.update ? "探测并更新 Git" : "探测项目",
      phase: "repository",
      status: "in_progress",
      children: [{
        id: `project-prepare-${selected.id}-detail`,
        name: selected.name,
        commandSummary: selected.operations.update ? `更新到 ${selected.branch}` : "探测项目状态",
        status: "in_progress",
      }],
    };
    this.tasks = ktcUpsertAutoBuildSessionTasks(this.tasks, [preparationPlan]);
    const preparationTask = this.tasks.find((task) => ktcAutoBuildTaskSessionKey(task) === ktcAutoBuildTaskSessionKey(preparationPlan))!;
    await this.post({ type: "tasks", tasks: this.tasks });
    let single: KtcAutoBuildConfiguration;
    let tasks: KtcAutoBuildTask[];
    let updateSkipped = false;
    try {
      const validationErrors = ktcValidateAutoBuildConfiguration({ ...configuration, projects: [selected] });
      if (validationErrors.length) throw new Error(validationErrors.join("\n"));
      selected = await this.probeProjectRow(selected, configuration.workingDirectory || "");
      if (this.stopped) throw new Error("项目准备已停止。");
      if (selected.operations.update) updateSkipped = await this.updateProjectRow(selected, configuration.workingDirectory || "") === "skipped";
      if (this.stopped) throw new Error("项目准备已停止。");
      single = { ...configuration, projects: [{ ...selected }] };
      tasks = ktcPlanAutoBuildTasks(single).filter((task) => task.phase !== "repository");
      if (!tasks.length && !selected.operations.update) throw new Error("该项目没有选择更新、linkCAA、CMake 或 CAA 操作。");
      preparationTask.status = "done";
      preparationTask.children?.forEach((child) => { child.status = updateSkipped ? "skipped" : "done"; child.detail = updateSkipped ? "有本地修改，保留并跳过更新；后续构建使用当前工作树" : "项目准备完成"; });
      await this.post({ type: "tasks", tasks: this.tasks });
    } catch (error) {
      preparationTask.status = "error";
      preparationTask.children?.forEach((child) => {
        child.status = "error";
        child.detail = this.stopped ? "操作已停止。" : "准备失败，请查看 Output。";
      });
      await this.post({ type: "tasks", tasks: this.tasks });
      if (this.stopped) {
        await this.status("idle", "项目准备已停止；未启动后续任务。");
        return;
      }
      throw error;
    }
    if (!tasks.length) { await this.status("done", updateSkipped ? `${selected.name} 有本地修改，已跳过更新。` : `${selected.name} 更新完成。`); return; }
    const script = vscode.Uri.joinPath(this.extensionUri, "scripts", "auto-build", "Invoke-AutoBuild.ps1").fsPath;
    this.tasks = ktcUpsertAutoBuildSessionTasks(this.tasks, tasks);
    const taskKeys = new Set(tasks.map(ktcAutoBuildTaskSessionKey));
    const sessionTasks = this.tasks.filter((task) => taskKeys.has(ktcAutoBuildTaskSessionKey(task)));
    await this.post({ type: "tasks", tasks: this.tasks });
    for (const task of sessionTasks) {
      if (!this.isLiveHandler()) return;
      if (this.stopped) { await this.status("idle", "操作已停止；已停止启动剩余项目任务。"); return; }
      task.status = "in_progress";
      task.children?.forEach((child) => { child.status = "in_progress"; });
      await this.post({ type: "tasks", tasks: this.tasks });
      const code = await this.runProcess(task, this.taskArguments(task, single, script), single);
      if (!this.isLiveHandler()) return;
      this.completeTaskRun(task, code);
      await this.post({ type: "tasks", tasks: this.tasks });
    }
    const failed = sessionTasks.filter((task) => task.status === "error");
    const skipped = sessionTasks.filter((task) => task.status === "skipped");
    const text = this.stopped ? `${selected.name} 已停止。` : `${selected.name} 执行结束：${failed.length} 个失败，${skipped.length} 个跳过${updateSkipped ? "；Git 更新已跳过" : ""}。`;
    this.log(text, true);
    await this.status(this.stopped ? "idle" : failed.length ? "error" : "done", text);
  }
  private async updateProjectRow(project: KtcAutoBuildProjectRow, working: string): Promise<KtcAutoBuildGitUpdateResult> {
    const abort = new AbortController();
    this.gitUpdateAbortController = abort;
    if (this.stopped) abort.abort();
    try {
      return await ktcUpdateAutoBuildProjectRepository(project, working, {
        signal: abort.signal,
        log: (message) => this.log(message),
      });
    } finally {
      if (this.gitUpdateAbortController === abort) this.gitUpdateAbortController = undefined;
    }
  }

  private async updateProject(configuration: KtcAutoBuildConfiguration, projectId: string, context: KtcAutoBuildDraftContext): Promise<void> {
    const project = configuration.projects.find((row) => row.id === projectId);
    if (!project) throw new Error("项目行已变化，请重新探测。");
    if (!project.enabled) throw new Error("该项目未启用。");
    this.log(`单独更新 ${project.name} → ${project.branch}；只更新 Git，不执行 link / export / build。`, true);
    try {
      const outcome = await this.updateProjectRow(project, configuration.workingDirectory || "");
      if (this.stopped) { await this.status("idle", "Git 更新已停止；未启动其他任务。"); return; }
      const probed = await this.probeProjectRow(project, configuration.workingDirectory || "");
      if (this.isCurrentDraftContext(context)) {
        await this.post({ type: "projectProbe", ...context, projectId, probe: probed.probe });
      }
      const text = outcome === "skipped"
        ? `${project.name} 有本地修改，已保留并跳过更新；未编译。`
        : `${project.name} Git 更新完成（${project.branch}）；未编译。`;
      this.log(text, true);
      await this.status("done", text);
    } catch (error) {
      if (!this.stopped) throw error;
      this.log(`Git 更新已停止：${project.name}；已完成的 Git 操作不会自动回滚。`, true);
      await this.status("idle", "Git 更新已停止；未启动其他任务。");
    }
  }
  private async postScriptStatus(): Promise<void> {
    const source = vscode.Uri.joinPath(this.extensionUri, "scripts").fsPath;
    const target = this.detectedRootDirectory;
    if (target && !ktcCanAccessAutoBuildPathOnHost(target, process.platform)) {
      if (!this.isLiveHandler()) return;
      this.companionScriptStatus = { status: "foreign", source, target };
      this.touchCompanion();
      await this.post({ type: "scriptStatus", status: "foreign", source, target, sourceHash: "", targetHash: "" });
      return;
    }
    const inspection = target
      ? await ktcInspectAutoBuildScriptSync(this.extensionUri.fsPath, target)
      : { status: "unavailable" as const, source, target: "", sourceHash: "", targetHash: "" };
    if (!this.isLiveHandler()) return;
    this.companionScriptStatus = {
      status: inspection.status as KtcAutoBuildScriptStatusSnapshot["status"],
      source: inspection.source,
      target: inspection.target,
    };
    this.touchCompanion();
    await this.post({ type: "scriptStatus", ...inspection });
  }
  private nonWindowsScriptNote(): string { return process.platform === "win32" ? "" : "；当前为非 Windows 检查环境：这里只生成或同步 PS1，实际执行请转到 Windows PowerShell 5.1 与 CAA/MSVC 工具链环境。"; }
  private warnNonWindowsBlindRun(): void { if (process.platform === "win32" || this.nonWindowsRunNoticeShown) return; this.nonWindowsRunNoticeShown = true; const notice = "当前为非 Windows 检查环境：运行仍会尝试现有链路，仅作盲开发检查，不能替代 Windows PowerShell 5.1 与 CAA/MSVC 实际构建。"; this.log(notice, true); void vscode.window.showWarningMessage(notice); }
  private taskArguments(task: KtcAutoBuildTask, configuration: KtcAutoBuildConfiguration, script: string): string[] { if (task.phase === "repository" || task.phase === "cmake") return []; if (task.phase === "link") return ktcLinkCaaArguments(configuration, task.path); if (task.phase === "export") return ktcExportArguments(task.path!); return ktcMkArguments(task.path!, "CAA"); }
  private async runProcess(task: KtcAutoBuildTask, args: string[], configuration: KtcAutoBuildConfiguration): Promise<number> {
    try {
      if (this.stopped) { task.status = "cancelled"; return -1; }
      if (task.phase === "repository") return await this.runRepositoryTask(task, configuration);
      const blockedBy = [...this.failedRepositoryPaths].find((failed) => {
        const normalize = (value: string) => {
          const normalized = value.replaceAll("\\", "/").replace(/\/+$/u, "");
          return process.platform === "win32" ? normalized.toLowerCase() : normalized;
        };
        const root = normalize(failed), target = normalize(task.path ?? "");
        return root === normalize(configuration.rootDirectory) || root === normalize(configuration.thirdPartyDirectory)
          || target === root || target.startsWith(`${root}/`);
      });
      if (blockedBy) {
        task.status = "skipped";
        this.log(`WARN ${task.name} 已跳过：依赖仓库更新失败 ${blockedBy}`);
        return 0;
      }
      if (task.phase === "cmake") {
        const cmakeFile = ktcJoinAutoBuildPath(task.path!, "CMakeLists.txt");
        if (!(await stat(cmakeFile)).isFile()) throw new Error(`未找到 CMakeLists.txt：${cmakeFile}`);
        let failures = 0;
        for (const plan of ktcPlanNativeCmakeBuild(task.path!, configuration.cmakeBuildTypes)) {
          if (this.stopped) break;
          this.log(`CMake ${plan.type} → ${plan.buildDirectory}（TypeScript；不调用 mk.ps1）`, true);
          const configureCode = await this.spawnTaskProcess(task, plan.configure, configuration, "cmake", plan.cwd);
          if (configureCode !== 0) { failures++; continue; }
          if (this.stopped) break;
          if (await this.spawnTaskProcess(task, plan.build, configuration, "cmake", plan.cwd) !== 0) failures++;
        }
        return this.stopped ? -1 : failures ? 1 : 0;
      }
      if (process.platform !== "win32") {
        task.status = "skipped";
        const reason = task.phase === "export"
          ? `未运行 export.ps1：${task.path}；当前 ${process.platform} 跳过 PowerShell 导出，继续顺序编译 CMake。依赖未导出时 CMake 会报告真实错误。`
          : `${task.name} 仍依赖 Windows ${task.phase === "caa" ? "CAA/RADE 工具链" : "链接脚本"}，本机已跳过；不视为执行成功。`;
        this.log(`WARN ${reason}`, true);
        return 0;
      }
      return await this.spawnTaskProcess(task, args, configuration);
    } catch (error) {
      this.log(`ERROR ${task.name}：${error instanceof Error ? error.message : String(error)}`, true);
      return this.stopped ? -1 : 1;
    }
  }

  private completeTaskRun(task: KtcAutoBuildTask, code: number): KtcAutoBuildTask["status"] {
    if (this.stopped) task.status = "cancelled";
    else if (task.status !== "skipped") task.status = code === 0 ? "done" : "error";
    if (task.phase !== "repository") task.children?.forEach((child) => { child.status = task.status; });
    return task.status;
  }

  private async runRepositoryTask(task: KtcAutoBuildTask, configuration: KtcAutoBuildConfiguration): Promise<number> {
    this.failedRepositoryPaths.clear();
    const rootRow = (id: string, name: string, path: string, branch: string, update: boolean): KtcAutoBuildProjectRow => ({
      id, name, path, branch, enabled: true, operations: { update, cmake: false, caa: false, linkCaa: false },
    });
    const repositories = [
      ...(ktcAutoBuildRootEnabled(configuration) ? [rootRow("root", "ROOT_DIR", configuration.rootDirectory, configuration.rootBranch, !!configuration.updateRoot)] : []),
      ...(ktcAutoBuildThirdPartyEnabled(configuration) ? [rootRow("third", "ROOT_DIR_3rdParty", configuration.thirdPartyDirectory, configuration.branch, !!configuration.updateThirdParty)] : []),
      ...configuration.projects.filter((project) => project.enabled && project.operations.update),
    ];
    let failures = 0;
    for (const project of repositories) {
      const child = task.children?.find((candidate) => candidate.id === `repository-${project.id}`);
      if (this.stopped) { if (child) child.status = "cancelled"; continue; }
      if (!project.operations.update) {
        if (child) { child.status = "skipped"; child.detail = "未勾选更新；仅保留探测结果"; }
        this.log(`${project.name}：未勾选更新，跳过 Git 写操作。`);
        continue;
      }
      if (child) child.status = "in_progress";
      await this.post({ type: "tasks", tasks: this.tasks });
      try {
        const result = await this.updateProjectRow(project, configuration.workingDirectory || "");
        if (child) {
          child.status = result === "skipped" ? "skipped" : "done";
          child.detail = result === "skipped" ? "有本地修改，保留现场并跳过" : `Git 已更新到 ${project.branch}`;
        }
      } catch (error) {
        failures++;
        this.failedRepositoryPaths.add(ktcResolveAutoBuildPath(project.path, configuration.workingDirectory || ""));
        const reason = error instanceof Error ? error.message : String(error);
        if (child) { child.status = this.stopped ? "cancelled" : "error"; child.detail = reason; }
        this.log(`ERROR ${project.name} 更新失败：${reason}；继续其他独立仓库。`, true);
      }
      await this.post({ type: "tasks", tasks: this.tasks });
    }
    return this.stopped ? -1 : failures ? 1 : 0;
  }

  private async spawnTaskProcess(task: KtcAutoBuildTask, args: string[], configuration: KtcAutoBuildConfiguration, program = "powershell.exe", cwd?: string): Promise<number> {
    const projectName = task.path?.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1);
    const phaseName = task.phase === "cmake"
      ? "CMake"
      : task.phase === "caa"
        ? "CAA"
        : task.phase === "export"
          ? "Export"
          : task.phase === "link"
            ? "LinkCAA"
            : "Repositories";
    const logTag = projectName ? `${phaseName}-${projectName}` : phaseName;
    if (process.platform === "win32"
      && [configuration.rootDirectory, configuration.thirdPartyDirectory, task.path]
        .filter((path): path is string => !!path)
        .some((path) => !ktcCanAccessAutoBuildPathOnHost(path, process.platform))) {
      throw new Error("Windows 实际执行仅接受盘符绝对路径或 UNC 共享根路径。");
    }
    if (program === "powershell.exe") this.warnNonWindowsBlindRun();
    this.log(`任务 ${task.name}；命令 ${program} ${args.join(" ")}`, true);
    return await new Promise<number>((resolve) => {
      const child = spawn(program, args, {
        cwd,
        shell: false,
        // Isolate POSIX CMake + compiler children so Stop targets only this task's process group.
        detached: program === "cmake" && process.platform !== "win32",
        windowsHide: true,
        env: {
          ...process.env,
          ROOT_DIR: configuration.rootDirectory,
          ROOT_DIR_3rdParty: configuration.thirdPartyDirectory,
        },
      });
      this.processes.add(child);
      if (program === "cmake" && process.platform !== "win32" && child.pid) this.nativeProcessGroups.add(child.pid);
      const streams = {
        stdout: { decoder: new StringDecoder("utf8"), pending: "" },
        stderr: { decoder: new StringDecoder("utf8"), pending: "" },
      };
      let settled = false;
      const write = (kind: "stdout" | "stderr", value: Buffer) => {
        const stream = streams[kind];
        stream.pending += stream.decoder.write(value);
        const lines = stream.pending.split(/\r?\n/);
        stream.pending = lines.pop() || "";
        for (const line of lines) {
          this.output.appendLine(line ? `[Auto Build][${logTag}][${kind}] ${line}` : "");
        }
      };
      const flush = (kind: "stdout" | "stderr") => {
        const stream = streams[kind];
        stream.pending += stream.decoder.end();
        if (stream.pending) this.output.appendLine(`[Auto Build][${logTag}][${kind}] ${stream.pending}`);
        stream.pending = "";
      };
      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        flush("stdout");
        flush("stderr");
        this.processes.delete(child);
        if (child.pid) this.nativeProcessGroups.delete(child.pid);
        this.log(`任务 ${task.name} exit code: ${code}`);
        resolve(code);
      };
      child.stdout.on("data", (value: Buffer) => write("stdout", value));
      child.stderr.on("data", (value: Buffer) => write("stderr", value));
      child.on("error", (error) => {
        this.log(`spawn error: ${error.message}`);
        finish(-1);
      });
      child.on("close", (code) => finish(code ?? -1));
    });
  }
  private async probeRepositories(configuration: KtcAutoBuildConfiguration): Promise<NonNullable<KtcAutoBuildConfiguration["repositorySnapshot"]>> {
    const selected = ktcSelectAutoBuildProjects(configuration); const candidates = [...(ktcAutoBuildRootEnabled(configuration) ? [{ role: "ROOT_DIR", path: configuration.rootDirectory }] : []), ...(ktcAutoBuildThirdPartyEnabled(configuration) ? [{ role: "ROOT_DIR_3rdParty", path: configuration.thirdPartyDirectory }] : []), ...selected.additionalRepositoryPaths.map((path) => ({ role: "更新的库", path })), ...selected.cmakeProjectPaths.map((path) => ({ role: "CMake", path })), ...selected.caaProjectPaths.map((path) => ({ role: "CAA", path }))];
    const repositories: NonNullable<KtcAutoBuildConfiguration["repositorySnapshot"]>["repositories"] = [], seen = new Set<string>();
    for (const candidate of candidates) {
      try {
        if (!ktcCanAccessAutoBuildPathOnHost(candidate.path, process.platform)) throw new Error("当前为非 Windows 环境，未访问 Windows 项目路径。");
        const top = (await execFileAsync("git", ["-C", candidate.path, "rev-parse", "--show-toplevel"], { encoding: "utf8" })).stdout.trim(), key = top.toLocaleLowerCase(); if (seen.has(key)) continue; seen.add(key);
        const branch = (await execFileAsync("git", ["-C", top, "branch", "--show-current"], { encoding: "utf8" })).stdout.trim() || "(detached)", commit = (await execFileAsync("git", ["-C", top, "rev-parse", "HEAD"], { encoding: "utf8" })).stdout.trim(), hasChanges = !!(await execFileAsync("git", ["-C", top, "status", "--porcelain=v1"], { encoding: "utf8" })).stdout.trim();
        let origin = ""; try { origin = (await execFileAsync("git", ["-C", top, "remote", "get-url", "origin"], { encoding: "utf8" })).stdout.trim(); } catch { origin = "(无 origin)"; }
        repositories.push({ role: candidate.role, path: top, branch, commit, origin, hasChanges });
      } catch (error) { repositories.push({ role: candidate.role, path: candidate.path, branch: "", commit: "", origin: "", error: error instanceof Error ? error.message.split(/\r?\n/, 1)[0] : String(error) }); }
    }
    this.log(`库探测完成：${repositories.filter((item) => !item.error).length}/${repositories.length} 个 Git 仓库；${repositories.filter((item) => item.hasChanges).length} 个有修改。`); return { capturedAt: new Date().toISOString(), repositories };
  }
  private async refreshRepositorySnapshot(configuration: KtcAutoBuildConfiguration, responseContext?: KtcAutoBuildDraftContext): Promise<void> {
    const projects = await Promise.all(configuration.projects.map((project) => this.probeProjectRow(project, configuration.workingDirectory || "")));
    if (!this.isLiveHandler() || responseContext && !this.isCurrentDraftContext(responseContext)) return;
    configuration.projects = projects;
    await this.post({
      type: "projects",
      mode: "probe",
      ...(responseContext ?? {}),
      projects: configuration.projects,
    });
    configuration.repositorySnapshot = await this.probeRepositories(configuration);
    if (!this.isLiveHandler() || responseContext && !this.isCurrentDraftContext(responseContext)) return;
    const repositoryTask = this.tasks.find((task) => task.phase === "repository");
    if (repositoryTask) { repositoryTask.children = configuration.repositorySnapshot.repositories.map((repository, index) => {
      const shouldUpdate = repository.role === "ROOT_DIR"
        ? configuration.clean || !!configuration.updateRoot
        : repository.role === "ROOT_DIR_3rdParty"
          ? configuration.clean || !!configuration.updateThirdParty
          : true;
      return { id: `repository-${index}`, name: `${repository.role} · ${repository.path}`, commandSummary: shouldUpdate ? configuration.clean && repository.role !== "更新的库" ? "清理并更新" : "检查并更新" : "跳过更新（仅探测）", detail: repository.error || `${repository.hasChanges ? "有修改" : "干净"} · ${repository.branch} · ${repository.commit.slice(0, 12)}`, status: repository.error ? "error" : repositoryTask.status };
    }); await this.post({ type: "tasks", tasks: this.tasks }); }
    await this.workspaceState.update(STATE_KEY, configuration);
    if (!this.isLiveHandler() || responseContext && !this.isCurrentDraftContext(responseContext)) return;
    await this.post({ type: "repositorySnapshot", ...(responseContext ?? {}), snapshot: configuration.repositorySnapshot });
  }
  private withoutLegacyAutomaticCleanup(configuration: KtcAutoBuildConfiguration): KtcAutoBuildConfiguration {
    const effective = ktcCloneAutoBuildConfiguration(configuration);
    if (!effective.clean) return effective;
    effective.clean = false;
    if (!this.legacyAutomaticCleanupNoticeShown) {
      this.legacyAutomaticCleanupNoticeShown = true;
      const notice = "旧配置中的自动清理已关闭；启动和预检不会再清理仓库。请从 Primary 执行区的“清理”按钮手动触发。";
      this.log(notice, true);
      void vscode.window.showWarningMessage(notice);
    }
    return effective;
  }

  private createFreshConfiguration(workingDirectory = this.defaultWorkingDirectory): KtcAutoBuildConfiguration {
    return defaults(
      this.detectedRootDirectory,
      this.detectedThirdPartyDirectory,
      workingDirectory,
    );
  }

  private normalizeWorkingDirectory(value: string | undefined): string {
    let normalized = (value?.trim() || "").replace(/\\/gu, "/");
    if (!normalized) return "";
    if (/^\/+$/u.test(normalized)) normalized = "/";
    else if (/^[A-Za-z]:\/+$/u.test(normalized)) normalized = `${normalized.slice(0, 2)}/`;
    else normalized = normalized.replace(/\/+$/u, "");
    const windowsStyle = process.platform === "win32"
      || /^[A-Za-z]:\//u.test(normalized)
      || /^\/\/[^/]/u.test(normalized);
    return windowsStyle ? normalized.toLowerCase() : normalized;
  }

  private hasWorkingDirectoryMismatch(configuration = this.companionConfiguration): boolean {
    if (!configuration) return false;
    const protectsExistingContext = this.loadedConfiguration || configuration.projects.length > 0;
    return protectsExistingContext
      && this.normalizeWorkingDirectory(configuration.workingDirectory)
        !== this.normalizeWorkingDirectory(this.workingDirectoryBaseline);
  }

  private reconcileWorkingDirectoryContext(configuration: KtcAutoBuildConfiguration): void {
    if (!this.loadedConfiguration && configuration.projects.length === 0) {
      this.workingDirectoryBaseline = configuration.workingDirectory?.trim() || "";
      this.workingDirectoryMismatch = false;
      return;
    }
    this.workingDirectoryMismatch = this.hasWorkingDirectoryMismatch(configuration);
  }

  private workingDirectoryMismatchError(): string {
    const current = this.companionConfiguration?.workingDirectory?.trim() || "未设置";
    return `工作目录已改变（${this.workingDirectoryBaseline || "未设置"} → ${current}）。请先在 Primary 选择“新建配置”或“保留项目”，避免把旧项目与新目录混合。`;
  }

  private assertWorkingDirectoryContext(configuration: KtcAutoBuildConfiguration): void {
    const previousMismatch = this.workingDirectoryMismatch;
    this.reconcileWorkingDirectoryContext(configuration);
    const changed = !this.companionConfiguration
      || !isDeepStrictEqual(configuration, this.companionConfiguration);
    if (changed) this.companionConfiguration = ktcCloneAutoBuildConfiguration(configuration);
    if (changed || previousMismatch !== this.workingDirectoryMismatch) this.touchCompanion();
    if (!this.workingDirectoryMismatch) return;
    throw new Error(this.workingDirectoryMismatchError());
  }

  private isPathSensitiveAction(type: Message["type"]): boolean {
    return [
      "preflight",
      "start",
      "runTask",
      "pickProjectDirectories",
      "discoverProjectDirectories",
      "probeProject",
      "updateProject",
      "runProject",
      "exportLauncher",
      "writeScript",
    ].includes(type);
  }

  private clearExecutionContext(): void {
    this.tasks = [];
    this.frozenCleanup = undefined;
    this.cleanupState = {};
    this.cleanupYamlWorkspace.invalidate();
    this.cleanupYamlContext++;
    this.cleanupYamlConfigurationFingerprint = "";
    this.cleanupYamlNotice = "配置已变化，请重新打开清理或探测配置。";
    this.stopped = false;
    this.companionStatus = "idle";
    this.companionMessage = "等待操作。";
  }

  private async postConfiguration(configuration: KtcAutoBuildConfiguration): Promise<void> {
    await this.post({
      type: "configuration",
      configuration,
      detectedRootDirectory: this.detectedRootDirectory,
      path: this.currentPath,
      recentPaths: this.workspaceState.get<string[]>(RECENT_KEY) || [],
      platform: process.platform,
    });
    await this.post({ type: "tasks", tasks: this.tasks });
  }

  private async postRestoredRightState(configuration: KtcAutoBuildConfiguration): Promise<void> {
    await this.postConfiguration(ktcCloneAutoBuildConfiguration(configuration));
    await this.postScriptStatus();
    if (!this.isLiveHandler()) return;
    await this.post({
      type: "status",
      status: this.companionStatus === "running" ? "in_progress" : this.companionStatus,
      text: this.companionMessage,
    });
  }

  private async resetToFreshConfiguration(): Promise<void> {
    const configuration = this.createFreshConfiguration();
    this.currentPath = "";
    this.loadedConfiguration = false;
    this.workingDirectoryBaseline = configuration.workingDirectory?.trim() || "";
    this.workingDirectoryMismatch = false;
    this.persistedConfigurationFingerprint = this.configurationFingerprint(configuration);
    this.clearExecutionContext();
    await this.workspaceState.update(PATH_KEY, undefined);
    if (!this.isLiveHandler()) return;
    await this.workspaceState.update(STATE_KEY, undefined);
    if (!this.isLiveHandler()) return;
    await this.postConfiguration(configuration);
    if (!this.isLiveHandler()) return;
    await this.status("idle", "已关闭当前配置；已新建未保存配置。");
  }

  private async startNewConfigurationForDirectory(configuration: KtcAutoBuildConfiguration): Promise<void> {
    const next = ktcCloneAutoBuildConfiguration({
      ...configuration,
      projects: [],
      repositorySnapshot: undefined,
    });
    this.currentPath = "";
    this.loadedConfiguration = false;
    this.workingDirectoryBaseline = next.workingDirectory?.trim() || "";
    this.workingDirectoryMismatch = false;
    this.persistedConfigurationFingerprint = this.configurationFingerprint(next);
    this.clearExecutionContext();
    await this.workspaceState.update(PATH_KEY, undefined);
    if (!this.isLiveHandler()) return;
    await this.workspaceState.update(STATE_KEY, undefined);
    if (!this.isLiveHandler()) return;
    await this.postConfiguration(next);
    if (!this.isLiveHandler()) return;
    await this.status("idle", "已为新的工作目录新建配置；旧项目与探测结果已清空。");
  }

  private async keepProjectsForDirectory(configuration: KtcAutoBuildConfiguration): Promise<void> {
    const projects = configuration.projects.map((project) => {
      const { probe: _probe, ...withoutProbe } = project;
      return withoutProbe;
    });
    const next = ktcCloneAutoBuildConfiguration({
      ...configuration,
      projects,
      repositorySnapshot: undefined,
    });
    this.workingDirectoryBaseline = next.workingDirectory?.trim() || "";
    this.workingDirectoryMismatch = false;
    this.clearExecutionContext();
    this.companionConfiguration = next;
    await this.postConfiguration(next);
    if (!this.isLiveHandler()) return;
    await this.status("idle", "已保留项目并迁移到新的工作目录；探测与任务状态已清空，请重新探测。");
  }

  private configurationFingerprint(configuration: KtcAutoBuildConfiguration): string {
    const workingDirectory = configuration.workingDirectory?.trim() || "";
    const canonicalProjectPath = (value: string): string => {
      try { return ktcResolveAutoBuildPath(value, workingDirectory); }
      catch { return value.trim(); }
    };
    return JSON.stringify({
      schemaVersion: 2,
      rootDirectory: configuration.rootDirectory.trim(),
      thirdPartyDirectory: configuration.thirdPartyDirectory.trim(),
      updateRoot: !!configuration.updateRoot,
      updateThirdParty: !!configuration.updateThirdParty,
      rootEnabled: ktcAutoBuildRootEnabled(configuration),
      thirdPartyEnabled: ktcAutoBuildThirdPartyEnabled(configuration),
      workingDirectory,
      rootBranch: configuration.rootBranch.trim(),
      branch: configuration.branch.trim(),
      cmakeBranch: configuration.cmakeBranch.trim(),
      buildExecutionMode: configuration.buildExecutionMode === "parallel" ? "parallel" : "sequential",
      cmakeBuildTypes: ktcSelectCmakeBuildTypes(configuration.cmakeBuildTypes),
      clean: configuration.clean,
      rootCleanupYaml: configuration.rootCleanupYaml ?? KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
      projects: configuration.projects.map((project) => ({
        id: project.id,
        enabled: project.enabled,
        name: project.name,
        path: canonicalProjectPath(project.path),
        branch: project.branch,
        operations: {
          update: project.operations.update,
          cmake: project.operations.cmake,
          caa: project.operations.caa,
          linkCaa: project.operations.linkCaa,
        },
      })),
    });
  }

  private configurationDirty(configuration = this.companionConfiguration): boolean {
    if (!configuration) return false;
    return this.configurationFingerprint(configuration) !== this.persistedConfigurationFingerprint;
  }

  private async confirmCloseConfiguration(configuration: KtcAutoBuildConfiguration): Promise<boolean> {
    if (!this.configurationDirty(configuration)) return true;
    const choice = await vscode.window.showWarningMessage(
      "当前配置有未保存修改。关闭前是否保存？",
      { modal: true, detail: "保存会写入当前 JSON；尚未写盘的配置将打开“另存为”。" },
      "保存",
      "不保存",
      "取消",
    );
    if (!this.isLiveHandler()) return false;
    if (choice === "不保存") return true;
    if (choice !== "保存") {
      await this.status("idle", "已取消关闭，当前配置保持打开。");
      return false;
    }
    const saved = await this.save(configuration, false);
    if (!saved && this.isLiveHandler()) await this.status("idle", "已取消关闭，当前配置保持打开。");
    return saved;
  }

  private async confirmDiscardChanges(configuration = this.companionConfiguration): Promise<boolean> {
    if (!this.configurationDirty(configuration)) return true;
    const choice = await vscode.window.showWarningMessage(
      "当前配置有未保存修改。继续会放弃这些修改。",
      { modal: true },
      "放弃修改",
    );
    if (!this.isLiveHandler()) return false;
    if (choice === "放弃修改") return true;
    await this.status("idle", "已保留当前未保存配置。");
    return false;
  }

  private async openConfigurationFromDialog(): Promise<void> {
    const uri = (await vscode.window.showOpenDialog({
      filters: { "Auto Build JSON": ["json"] },
      canSelectMany: false,
    }))?.[0];
    if (!this.isLiveHandler()) return;
    if (uri) await this.load(uri.fsPath);
  }

  private async load(path: string): Promise<void> {
    if (!ktcCanAccessAutoBuildPathOnHost(path, process.platform)) throw new Error("配置文件是 Windows 路径，当前非 Windows 环境未读取该文件。");
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!ktcIsAutoBuildConfiguration(parsed)) throw new Error("Auto Build JSON 不符合 schemaVersion 2 完整结构。");
    const loaded = ktcCloneAutoBuildConfiguration(parsed);
    const effective = this.withoutLegacyAutomaticCleanup(loaded);
    const value = effective;
    if (!this.isLiveHandler()) return;
    this.currentPath = path;
    this.loadedConfiguration = true;
    this.workingDirectoryBaseline = value.workingDirectory?.trim() || "";
    this.workingDirectoryMismatch = false;
    this.persistedConfigurationFingerprint = this.configurationFingerprint(value);
    this.clearExecutionContext();
    await this.remember(value, path);
    if (!this.isLiveHandler()) return;
    await this.postConfiguration(value);
    await this.postScriptStatus();
  }

  private async defaultSaveUri(configuration: KtcAutoBuildConfiguration): Promise<vscode.Uri | undefined> {
    const currentPathIsLocal = !!this.currentPath
      && ktcCanAccessAutoBuildPathOnHost(this.currentPath, process.platform);
    const fileName = currentPathIsLocal
      ? basename(this.currentPath) || "auto-build.json"
      : "auto-build.json";
    const candidates = [
      configuration.workingDirectory?.trim() || "",
      currentPathIsLocal ? dirname(this.currentPath) : "",
      this.defaultWorkingDirectory,
      vscode.workspace?.workspaceFolders?.[0]?.uri.fsPath || "",
    ];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      if (!ktcCanAccessAutoBuildPathOnHost(candidate, process.platform)) continue;
      try {
        if (!(await stat(candidate)).isDirectory()) continue;
        return vscode.Uri.file(join(candidate, fileName));
      } catch {
        // A stale or foreign directory must not prevent the native dialog from opening.
      }
    }
    return undefined;
  }

  private async save(configuration: KtcAutoBuildConfiguration, saveAs: boolean): Promise<boolean> {
    const effective = this.withoutLegacyAutomaticCleanup(configuration);
    this.assertWorkingDirectoryContext(effective);
    let path = saveAs ? "" : this.currentPath;
    if (!path) {
      const defaultUri = await this.defaultSaveUri(effective);
      if (!this.isLiveHandler()) return false;
      path = (await vscode.window.showSaveDialog({
        filters: { "Auto Build JSON": ["json"] },
        ...(defaultUri ? { defaultUri } : {}),
      }))?.fsPath || "";
      if (!this.isLiveHandler()) return false;
    }
    if (!path) return false;
    if (!ktcCanAccessAutoBuildPathOnHost(path, process.platform)) throw new Error("配置文件是 Windows 路径，当前非 Windows 环境未写入该文件。");
    const working = effective.workingDirectory || "";
    const value = {
      ...effective,
      schemaVersion: 2 as const,
      projects: effective.projects.map((project) => ({
        ...project,
        path: ktcStoreAutoBuildPath(ktcResolveAutoBuildPath(project.path, working), working),
      })),
    };
    if (!this.isLiveHandler()) return false;
    await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
    if (!this.isLiveHandler()) return false;
    this.currentPath = path;
    this.persistedConfigurationFingerprint = this.configurationFingerprint(value);
    this.companionConfiguration = effective;
    this.loadedConfiguration = true;
    this.workingDirectoryBaseline = effective.workingDirectory?.trim() || "";
    this.workingDirectoryMismatch = false;
    await this.remember(value, path);
    if (!this.isLiveHandler()) return false;
    await this.post({ type: "saved", path, recentPaths: this.workspaceState.get<string[]>(RECENT_KEY) || [] });
    await this.status("done", `已保存：${path}`);
    return true;
  }
  private async remember(configuration: KtcAutoBuildConfiguration, path: string): Promise<void> { const recent = [path, ...(this.workspaceState.get<string[]>(RECENT_KEY) || []).filter((v) => v !== path)].slice(0, 8); if (!this.isLiveHandler()) return; await this.workspaceState.update(STATE_KEY, configuration); if (!this.isLiveHandler()) return; await this.workspaceState.update(PATH_KEY, path); if (!this.isLiveHandler()) return; await this.workspaceState.update(RECENT_KEY, recent); }
  private async status(status: string, text: string): Promise<void> {
    if (!this.isLiveHandler()) return;
    this.companionStatus = status === "in_progress"
      ? "running"
      : status === "error"
        ? "error"
        : status === "done"
          ? "done"
          : "idle";
    this.companionMessage = text;
    this.touchCompanion();
    await this.post({ type: "status", status, text });
  }

  private async post(value: unknown): Promise<void> {
    const context = this.sessionContext.getStore();
    if (context && !this.isLiveSession(context)) return;
    if (value && typeof value === "object" && "type" in value) {
      const message = value as {
        type?: string;
        configuration?: KtcAutoBuildConfiguration;
        projects?: KtcAutoBuildProjectRow[];
      };
      if (message.type === "configuration" && message.configuration) {
        this.companionConfiguration = message.configuration;
        this.touchCompanion();
      } else if (message.type === "projects" && message.projects && this.companionConfiguration) {
        this.companionConfiguration = { ...this.companionConfiguration, projects: message.projects };
        this.touchCompanion();
      } else if (message.type === "tasks") {
        this.touchCompanion();
      }
    }
    const panel = context?.panel ?? this.panel;
    if (context && !this.isLiveSession(context)) return;
    await panel?.webview.postMessage(value);
  }

  private touchCompanion(): void {
    if (!this.isLiveHandler()) return;
    this.companionRevision += 1;
    this.publishCompanion();
  }

  private companionLifecycle(): KtcEditorPrimaryCompanionLifecycle {
    if (!this.panel) return "disposed";
    if (this.panel.active) return "active";
    return this.panel.visible ? "visible" : "open-inactive";
  }

  private companionSnapshot(
    lifecycle: KtcEditorPrimaryCompanionLifecycle = this.companionLifecycle(),
  ): KtcEditorPrimaryCompanionSnapshot {
    const configuration = this.companionConfiguration;
    const liveReady = this.companionReady && lifecycle !== "disposed";
    const running = this.tasks.filter((task) => task.status === "in_progress").length;
    const failed = this.tasks.filter((task) => task.status === "error").length;
    const configName = this.currentPath
      ? this.currentPath.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || this.currentPath
      : "未保存";
    const recentPaths = this.workspaceState.get<string[]>(RECENT_KEY) || [];
    const baseActionAvailable = liveReady
      && !this.companionPendingAction
      && this.companionStatus !== "running"
      && this.processes.size === 0;
    const executionAvailable = baseActionAvailable && !this.workingDirectoryMismatch;
    const executionDisabledReason = !liveReady
      ? "右侧编译工具尚未就绪。"
      : this.companionPendingAction
        ? "正在处理当前操作。"
        : this.workingDirectoryMismatch
          ? this.workingDirectoryMismatchError()
        : "已有任务正在运行。";
    const maintenanceAvailable = executionAvailable
      && !!this.detectedRootDirectory
      && ktcCanAccessAutoBuildPathOnHost(this.detectedRootDirectory, process.platform)
      && !ktcIsAutoBuildFilesystemRoot(this.detectedRootDirectory);
    const pendingExecution = this.companionPendingAction === "preflight"
      || this.companionPendingAction === "start"
      || this.companionPendingAction === "runProject"
      || this.companionPendingAction === "updateProject"
      || this.companionPendingAction === "runTask"
      || this.companionPendingAction === "cleanupDialog";
    const stopAvailable = liveReady
      && (this.companionStatus === "running" || this.processes.size > 0 || pendingExecution);
    const primary = ktcCreateAutoBuildPrimaryViewModel({
      configuration,
      tasks: this.tasks,
      currentPath: this.currentPath,
      recentPaths,
      dirty: !this.currentPath || this.configurationDirty(),
      workingDirectoryMismatch: this.workingDirectoryMismatch,
      workingDirectoryBaseline: this.workingDirectoryBaseline,
      defaultWorkingDirectory: this.defaultWorkingDirectory,
      platform: process.platform,
      scriptStatus: this.companionScriptStatus,
      cleanupEnabled: executionAvailable,
      cleanupDisabledReason: executionDisabledReason,
      cleanupState: this.cleanupState,
      cleanupYaml: {
        workingDirectory: ktcAutoBuildCleanupDirectory(configuration?.workingDirectory, this.defaultWorkingDirectory),
        sources: this.cleanupYamlWorkspace.sources,
        busy: !executionAvailable,
        contextId: `${this.companionDocumentId}:${this.cleanupYamlContext}`,
        notice: this.cleanupYamlNotice,
      },
    });
    return {
      panelId: this.companionSessionId,
      toolId: "autoBuild",
      sessionId: this.companionSessionId,
      revision: this.companionRevision,
      lifecycle,
      status: this.companionStatus,
      message: ktcEditorPrimaryCompanionStatusMessage(
        this.companionStatus,
        this.companionMessage,
      ),
      ready: liveReady,
      summary: [
        { label: "配置", value: configName },
        { label: "目录", value: configuration?.workingDirectory?.trim() || this.defaultWorkingDirectory || "未设置" },
        { label: "项目", value: `${configuration?.projects.length ?? 0} 个` },
        { label: "任务", value: running ? `${running} 个进行中` : failed ? `${failed} 个失败` : `${this.tasks.length} 个` },
        { label: "平台", value: process.platform === "win32" ? "Windows" : `${process.platform}（检查）` },
      ],
      actions: [
        { id: "openScript", label: "脚本", enabled: liveReady },
        {
          id: "preflight",
          label: "预检配置",
          enabled: executionAvailable,
          ...(executionAvailable ? {} : { disabledReason: executionDisabledReason }),
        },
        {
          id: "start",
          label: "启动",
          enabled: executionAvailable,
          tone: "primary",
          ...(executionAvailable ? {} : { disabledReason: executionDisabledReason }),
        },
        {
          id: "stop",
          label: "停止",
          enabled: stopAvailable,
          tone: "danger",
          ...(stopAvailable ? {} : { disabledReason: "当前没有运行或等待启动的任务。" }),
        },
        {
          id: "openCleanup",
          label: "清理",
          enabled: executionAvailable,
          tone: "secondary",
          ...(executionAvailable ? {} : { disabledReason: executionDisabledReason }),
        },
        {
          id: "toggleParallelBuild",
          label: "并行编译",
          enabled: executionAvailable,
          ...(executionAvailable ? {} : { disabledReason: executionDisabledReason }),
        },
        {
          id: "setCmakeBuildTypes",
          label: "CMake 编译配置",
          enabled: executionAvailable && !!configuration,
          disabledReason: executionDisabledReason,
        },
        { id: "reveal", label: "详细配置", enabled: liveReady },
        { id: "openOutput", label: "Output", enabled: liveReady },
        {
          id: "openConfig",
          label: "打开",
          enabled: executionAvailable,
          ...(executionAvailable ? {} : { disabledReason: executionDisabledReason }),
        },
        {
          id: "saveConfig",
          label: "保存",
          enabled: executionAvailable && !!configuration && (!this.currentPath || this.configurationDirty()),
          ...(executionAvailable && !!configuration && (!this.currentPath || this.configurationDirty())
            ? {}
            : { disabledReason: this.currentPath && !this.configurationDirty() ? "当前配置没有未保存修改。" : executionDisabledReason }),
        },
        {
          id: "saveAsConfig",
          label: "另存",
          enabled: executionAvailable && !!configuration,
          ...(executionAvailable && !!configuration
            ? {}
            : { disabledReason: configuration ? executionDisabledReason : "当前没有可保存的配置。" }),
        },
        {
          id: "closeConfig",
          label: "关闭",
          enabled: baseActionAvailable && !!configuration,
          ...(baseActionAvailable && !!configuration
            ? {}
            : { disabledReason: configuration ? executionDisabledReason : "当前没有可关闭的配置。" }),
        },
        {
          id: "newConfigForDirectory",
          label: "新建配置",
          enabled: baseActionAvailable && this.workingDirectoryMismatch,
          ...(baseActionAvailable && this.workingDirectoryMismatch
            ? {}
            : { disabledReason: this.workingDirectoryMismatch ? executionDisabledReason : "工作目录没有变化。" }),
        },
        {
          id: "keepProjectsForDirectory",
          label: "保留项目",
          enabled: baseActionAvailable && this.workingDirectoryMismatch,
          ...(baseActionAvailable && this.workingDirectoryMismatch
            ? {}
            : { disabledReason: this.workingDirectoryMismatch ? executionDisabledReason : "工作目录没有变化。" }),
        },
        ...recentPaths.map((path, index) => ({
          id: `selectRecent${index}`,
          label: path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || path,
          enabled: executionAvailable && path !== this.currentPath,
          ...(executionAvailable && path !== this.currentPath ? {} : { disabledReason: path === this.currentPath ? "当前配置已打开。" : executionDisabledReason }),
        })),
        {
          id: "cleanupDialog",
          label: "清理",
          enabled: executionAvailable,
          tone: "danger",
          ...(executionAvailable ? {} : { disabledReason: executionDisabledReason }),
        },
        {
          id: "syncRootScript",
          label: "同步脚本",
          enabled: maintenanceAvailable,
          ...(maintenanceAvailable
            ? {}
            : { disabledReason: "当前 Root 不可写或正在处理其他操作。" }),
        },
      ],
      primary: { kind: "autoBuild", model: primary },
    };
  }

  private publishCompanion(lifecycle?: KtcEditorPrimaryCompanionLifecycle): void {
    if (!this.companionSessionId) return;
    const snapshot = this.companionSnapshot(lifecycle);
    this.companion?.onDidChange(snapshot);
    void this.panel?.webview.postMessage({ type: "autoBuildCleanupState", snapshot });
  }

  private async updateRootCleanupYaml(value: string): Promise<void> {
    if (!this.companionConfiguration) throw new Error("当前没有可更新的 Auto Build 配置。");
    const rootCleanupYaml = value.slice(0, KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH);
    this.companionConfiguration = ktcCloneAutoBuildConfiguration({
      ...this.companionConfiguration,
      rootCleanupYaml,
    });
    await this.post({ type: "rootCleanupYaml", value: rootCleanupYaml });
  }

  private currentSessionContext(): KtcAutoBuildSessionContext | undefined {
    const panel = this.panel;
    if (!panel || !this.companionSessionId) return undefined;
    return { epoch: this.companionEpoch, panel, sessionId: this.companionSessionId };
  }

  private isLiveSession(context: KtcAutoBuildSessionContext): boolean {
    return this.companionEpoch === context.epoch
      && this.panel === context.panel
      && this.companionSessionId === context.sessionId;
  }

  private isLiveHandler(): boolean {
    const context = this.sessionContext.getStore();
    return !context || this.isLiveSession(context);
  }
  private html(webview: vscode.Webview): string {
    const { nonce, csp } = ktcCreateWebviewSecurity(webview);
    const rightShellUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "ktc-right-view-shell.js"));
    const componentUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "auto-build-view.js"));
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden}body{padding:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px var(--vscode-font-family)}ktc-right-view-shell{display:block;width:100%;height:100%}.auto-build-main{min-width:0;min-height:100%;padding:12px;box-sizing:border-box}.actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.repo{display:grid;grid-template-columns:150px minmax(220px,1fr) 150px;gap:6px;align-items:center;margin:5px 0}.repo.head{color:var(--vscode-descriptionForeground);font-size:11px}input,textarea,select{color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-contrastBorder,var(--vscode-panel-border)));padding:5px}input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}textarea{width:100%;box-sizing:border-box}.build{display:grid;grid-template-columns:80px 1fr;gap:7px;margin:6px 0}button{padding:5px 10px}.status{margin:7px 0;padding:6px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textBlockQuote-background)}</style></head><body><ktc-right-view-shell id="autoBuildRightShell"><div id="autoBuildHeaderActions" class="header-actions" slot="actions"></div><main id="autoBuildMain" class="auto-build-main"><pnw-collapsible-block title="仓库"><div class="repo head"><span>角色</span><span>目录</span><span>分支</span></div><div class="repo"><strong>ROOT_DIR</strong><input id="root"><input id="rootBranch"></div><div class="repo"><strong>ROOT_DIR_3rdParty</strong><input id="third"><input id="branch"></div><div class="repo"><strong>CMake 项目</strong><span>使用下方目录列表</span><input id="cmakeBranch"></div></pnw-collapsible-block><pnw-collapsible-block title="构建目录"><label class="build">CMake<textarea id="cmake" rows="4"></textarea></label><label class="build">CAA<textarea id="caa" rows="4"></textarea></label></pnw-collapsible-block><pnw-collapsible-block title="执行"><div class="actions"><button id="preflight">预检配置</button><button id="start">启动</button><button id="stop" disabled>停止</button></div><div class="status" id="status">空闲</div></pnw-collapsible-block></main></ktc-right-view-shell><script nonce="${nonce}" src="${rightShellUri}"></script><script nonce="${nonce}" src="${componentUri}"></script><script nonce="${nonce}">const vscode=acquireVsCodeApi(),$=id=>document.getElementById(id),list=id=>$(id).value.split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);const config=()=>({schemaVersion:1,rootDirectory:$('root').value.trim(),thirdPartyDirectory:$('third').value.trim(),rootBranch:$('rootBranch').value.trim(),branch:$('branch').value.trim(),cmakeBranch:$('cmakeBranch').value.trim(),cmakeProjectPaths:list('cmake'),caaProjectPaths:list('caa'),clean:false});const busy=v=>{$('preflight').disabled=v;$('start').disabled=v;$('stop').disabled=!v};const action=type=>{if(type==='preflight'||type==='start'){$('status').textContent=type==='start'?'正在启动…':'正在预检…';busy(true)}vscode.postMessage(type==='stop'?{type}:{type,configuration:config()})};$('preflight').onclick=()=>action('preflight');$('start').onclick=()=>action('start');$('stop').onclick=()=>action('stop');function fill(c){$('root').value=c.rootDirectory||'';$('third').value=c.thirdPartyDirectory||'';$('rootBranch').value=c.rootBranch||'develop';$('branch').value=c.branch||'develop';$('cmakeBranch').value=c.cmakeBranch||'master';$('cmake').value=(c.cmakeProjectPaths||[]).join('\\n');$('caa').value=(c.caaProjectPaths||[]).join('\\n')}window.addEventListener('message',e=>{const m=e.data;if(m.type==='configuration')fill(m.configuration);else if(m.type==='status'){$('status').textContent=m.text;busy(m.status==='in_progress')}});</script></body></html>`;
  }
}
