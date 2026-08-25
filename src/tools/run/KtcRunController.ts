import { access, stat } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import {
  KtcCreateRunModel,
  type KtcRunExecution,
  type KtcRunExecutionState,
  type KtcRunPlatform,
  type KtcRunProjectInput,
  type KtcRunTargetInput,
  type KtcRunViewModel,
} from "../../core/run/KtcRunModel.js";
import type { ToolRunContext, ToolUiState } from "../types.js";
import {
  KtcRunWingAdapter,
  type KtcPnwRunProject,
  type KtcPnwRunTarget,
} from "./KtcRunWingAdapter.js";
import {
  KtcResolveCaaRelatedProjects,
  KtcSerializeCaaRelatedProjects,
} from "./KtcRunProjectSettings.js";
import {
  KtcCaaInstallationArguments,
  KtcCaaRadeCommandRoot,
  KtcCaaRuntimeLabel,
  KtcResolveCaaInstallation,
} from "./KtcCaaInstallation.js";
import { KtcSelectRunDisplayTargets, KtcSelectRunExecutionProvider } from "./KtcRunDisplayTargets.js";

export type KtcRunActionMessage =
  | { readonly action: "refresh" | "openOutput" | "openProblems" | "openTerminal" }
  | { readonly action: "runTarget" | "dryRunTarget"; readonly targetId: string }
  | { readonly action: "stopRun"; readonly runId: string }
  | { readonly action: "selectCaaRelated" | "addCaaRelatedFolder"; readonly projectId: string }
  | { readonly action: "setCaaVersion"; readonly projectId: string; readonly value: string }
  | { readonly action: "setCaaRuntimeDirectory"; readonly value: string }
  | { readonly action: "openSource"; readonly targetId: string };

interface KtcRunProjectRecord {
  readonly id: string;
  readonly workspaceRoot: string;
  readonly project: KtcPnwRunProject;
}

interface KtcRunTargetRecord {
  readonly id: string;
  readonly project: KtcRunProjectRecord;
  readonly target: KtcPnwRunTarget;
  readonly alternatives: readonly KtcPnwRunTarget[];
}

interface KtcRunExecutionRecord {
  readonly runId: string;
  readonly target: KtcRunTargetRecord;
  readonly execution: vscode.TaskExecution;
  readonly startedAt: number;
  state: KtcRunExecutionState;
  exitCode?: number;
}

interface KtcCaaProjectSetting {
  readonly caaRelatedProjects?: readonly string[];
}

type KtcCaaProjectsSetting = Readonly<Record<string, KtcCaaProjectSetting>>;

const KtcCaaVersionSelectionStateKey = "ktAutoCode.run.caaVersions.v1";
const KtcLegacyCaaRelatedStateKey = "ktAutoCode.run.caaRelatedRoots.v1";

export class KtcRunController {
  private readonly KtcAdapter = new KtcRunWingAdapter();
  private readonly KtcProjects = new Map<string, KtcRunProjectRecord>();
  private readonly KtcTargets = new Map<string, KtcRunTargetRecord>();
  private readonly KtcNativeTasks = new Map<string, vscode.Task>();
  private readonly KtcExecutions = new Map<string, KtcRunExecutionRecord>();
  private readonly KtcRunByExecution = new Map<vscode.TaskExecution, string>();
  private KtcExtensionContext: vscode.ExtensionContext | undefined;
  private KtcLastRunContext: ToolRunContext | undefined;
  private KtcDiagnostics: string[] = [];
  private KtcIncomplete = false;

  register(context: vscode.ExtensionContext): void {
    this.KtcExtensionContext = context;
    context.subscriptions.push(
      vscode.tasks.onDidEndTaskProcess((event) => this.KtcOnEndProcess(event)),
      vscode.tasks.onDidEndTask((event) => this.KtcOnEndTask(event)),
    );
  }

  async refresh(ctx: ToolRunContext): Promise<void> {
    this.KtcLastRunContext = ctx;
    ctx.postState({ status: "running", message: "正在发现 Task、脚本和运行目标…" });
    const platform = KtcPlatform();
    const folders = (vscode.workspace.workspaceFolders ?? []).filter((folder) => folder.uri.scheme === "file");
    const discoveries = await Promise.all(folders.map(async (folder) => {
      try {
        return await this.KtcAdapter.discover(folder.uri.fsPath, platform);
      } catch (error) {
        ctx.log(`[ERROR] Run：无法扫描“${folder.name}”：${KtcErrorMessage(error)}`);
        return undefined;
      }
    }));
    this.KtcProjects.clear();
    this.KtcTargets.clear();
    this.KtcNativeTasks.clear();
    this.KtcDiagnostics = [];
    this.KtcIncomplete = false;
    for (const discovery of discoveries) {
      if (!discovery) continue;
      this.KtcIncomplete ||= discovery.incomplete;
      this.KtcDiagnostics.push(...discovery.diagnostics.map((item) => `${item.code}: ${item.message}`));
      const projectIds = new Map<string, KtcRunProjectRecord>();
      for (const project of discovery.projects) {
        const id = KtcScopedId(discovery.workspaceRoot, project.id);
        const record = { id, workspaceRoot: discovery.workspaceRoot, project };
        projectIds.set(project.id, record);
        this.KtcProjects.set(id, record);
      }
      for (const logical of this.KtcDisplayTargets(discovery.targets)) {
        const project = projectIds.get(logical.target.projectId);
        if (!project) continue;
        const id = KtcScopedId(discovery.workspaceRoot, logical.target.id);
        this.KtcTargets.set(id, { id, project, target: logical.target, alternatives: logical.alternatives });
      }
    }
    await this.KtcMatchNativeTasks();
    this.KtcPostState(ctx);
  }

  async handle(action: KtcRunActionMessage, ctx: ToolRunContext): Promise<void> {
    this.KtcLastRunContext = ctx;
    if (action.action === "refresh") {
      await this.refresh(ctx);
      return;
    }
    if (action.action === "openOutput") {
      ctx.log("[Run] 已从 Run Primary 打开 KT Auto Code 输出。");
      return;
    }
    if (action.action === "openProblems") {
      await vscode.commands.executeCommand("workbench.actions.view.problems");
      return;
    }
    if (action.action === "openTerminal") {
      await vscode.commands.executeCommand("workbench.action.terminal.focus");
      return;
    }
    if (action.action === "setCaaVersion") {
      await this.KtcSetCaaVersion(action.projectId, action.value, ctx);
      return;
    }
    if (action.action === "setCaaRuntimeDirectory") {
      await this.KtcSetCaaRuntimeDirectory(action.value, ctx);
      return;
    }
    if (action.action === "selectCaaRelated") {
      await this.KtcSelectCaaRelated(action.projectId, ctx);
      return;
    }
    if (action.action === "addCaaRelatedFolder") {
      await this.KtcAddCaaRelatedFolder(action.projectId, ctx);
      return;
    }
    if (action.action === "runTarget") {
      await this.KtcRunTarget(action.targetId, ctx);
      return;
    }
    if (action.action === "dryRunTarget") {
      this.KtcDryRunTarget(action.targetId, ctx);
      return;
    }
    if (action.action === "stopRun") {
      this.KtcStopRun(action.runId, ctx);
      return;
    }
    if (action.action === "openSource") await this.KtcOpenSource(action.targetId);
  }

  private async KtcRunTarget(targetId: string, ctx: ToolRunContext): Promise<void> {
    const selectedRecord = this.KtcTargets.get(targetId);
    if (!selectedRecord) throw new Error("运行目标已变化，请刷新 Run Block。");
    const relatedRoots = selectedRecord.target.action === "caa-build"
      ? this.KtcCaaRelatedRoots(selectedRecord.project.id)
      : [];
    const record = relatedRoots.length > 0 ? KtcBundledCaaRecord(selectedRecord) : selectedRecord;
    if (!vscode.workspace.isTrusted) throw new Error("未信任工作区只允许发现目标；请先使用 VS Code Workspace Trust。");
    if (record.target.disabledReason) throw new Error(KtcDisabledReason(record.target.disabledReason));
    if (!record.target.platforms.includes(KtcPlatform())) {
      ctx.log(`[Run][preflight] target=${record.id} compatible=false reason=platform-mismatch`);
      throw new Error(`目标仅支持 ${record.target.platforms.join(" / ")}，当前为 ${KtcPlatform()}。`);
    }
    if ([...this.KtcExecutions.values()].some((item) => KtcIsActive(item.state)
      && (item.target.id === record.id
        || (KtcIsCaa(item.target.target) && KtcIsCaa(record.target) && item.target.project.id === record.project.id)))) {
      throw new Error("同一目标或同一 CAA 项目已有任务正在运行。");
    }
    const caa = KtcIsCaa(record.target) ? this.KtcCaaVersion(record.project) : undefined;
    if (record.target.sourceKind === "native-task" && caa) {
      const environment = KtcSafeCaaVersion(process.env.CAA_MK_VERSION);
      if (caa.value !== (environment ?? "19")) {
        throw new Error(`原生 Task 无法安全覆盖 CAA 版本；当前任务环境是 ${environment ?? "默认 19"}，所选为 ${caa.value}。请选择脚本/内置来源或更新工程环境。`);
      }
    }
    if (record.target.sourceKind === "bundled" && KtcIsCaa(record.target)) {
      await this.KtcPreflightBundledCaa(record, caa!.value, relatedRoots, ctx);
    }
    // Primary Tree 单击即执行：安全边界由上面的 trust/平台/并发/CAA 预检保证，
    // 不再额外弹出确认框中断常用的构建与运行流程。
    const task = await this.KtcCreateTask(record, caa?.value, relatedRoots);
    let execution: vscode.TaskExecution;
    try {
      execution = await vscode.tasks.executeTask(task);
    } catch (error) {
      ctx.log(`[ERROR] Run：无法启动“${record.target.label}”：${KtcErrorMessage(error)}`);
      throw error;
    }
    const runId = `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const state: KtcRunExecutionRecord = { runId, target: record, execution, startedAt: Date.now(), state: "running" };
    this.KtcExecutions.set(runId, state);
    this.KtcRunByExecution.set(execution, runId);
    this.KtcTrimExecutionHistory();
    this.KtcPostState(ctx);
    ctx.log(`[Run] ▶ ${record.target.label} · ${record.project.project.label} 已启动。`);
  }

  private KtcDryRunTarget(targetId: string, ctx: ToolRunContext): void {
    const selectedRecord = this.KtcTargets.get(targetId);
    if (!selectedRecord) throw new Error("运行目标已变化，请刷新 Run Block。");
    const relatedRoots = selectedRecord.target.action === "caa-build"
      ? this.KtcCaaRelatedRoots(selectedRecord.project.id)
      : [];
    const record = relatedRoots.length > 0 ? KtcBundledCaaRecord(selectedRecord) : selectedRecord;
    const target = record.target;
    const currentPlatform = KtcPlatform();
    const compatible = target.platforms.includes(currentPlatform);
    let program = target.program || (target.sourceKind === "native-task" ? "<native-task>" : "<not-resolved>");
    let args = [...target.args];
    let plannedPlatform = currentPlatform;
    if (target.sourceKind === "bundled" && target.action === "clang-format") {
      const extension = this.KtcRequireExtensionContext();
      const plan = this.KtcAdapter.createBundledClangFormatLaunchPlan(target, {
        resourceRoot: path.join(extension.extensionUri.fsPath, "resources", "run"),
        runtimeProgram: process.execPath,
      });
      program = plan.program;
      args = [...plan.args];
    } else if (target.sourceKind === "bundled" && KtcIsCaa(target)) {
      plannedPlatform = target.platforms[0] ?? "win32";
      const extension = this.KtcRequireExtensionContext();
      const caaVersion = this.KtcCaaVersion(record.project).value;
      const plan = this.KtcAdapter.createBundledCaaLaunchPlan(target, {
        platform: plannedPlatform,
        resourceRoot: path.join(extension.extensionUri.fsPath, "resources", "run"),
        caaVersion,
        relatedProjectRoots: target.action === "caa-build" ? relatedRoots : [],
      });
      program = plan.program;
      args = [...plan.args, ...KtcCaaInstallationArguments(this.KtcCaaInstallation(caaVersion))];
    }
    const command = [program, ...args]
      .map(KtcRunLogArgument)
      .join(" ");
    ctx.log(`[Run][trial] execute=false target=${KtcRunLogIdentity(record.id)} project=${KtcRunLogIdentity(record.project.id)}`);
    ctx.log(`[Run][trial] currentPlatform=${currentPlatform} plannedPlatform=${plannedPlatform} supported=${target.platforms.join(",")} compatible=${compatible}`);
    ctx.log(`[Run][trial] source=${target.sourceKind} cwd=${KtcDisplayPath(target.cwd)} risk=${target.risk}`);
    ctx.log(`[Run][trial] command=${command || "<not-resolved>"}`);
    ctx.log(`[Run][trial] matcher=${target.problemMatchers.join(",") || "none"} fidelity=${target.matcherFidelity} envKeys=${target.envKeys.join(",") || "none"}`);
    if (target.disabledReason) ctx.log(`[Run][trial] disabledReason=${KtcDisabledReason(target.disabledReason)}`);
    ctx.postState({
      status: "done",
      message: compatible
        ? `“${target.label}”试运行完成：当前系统兼容，但未启动任务；详情见日志。`
        : `“${target.label}”试运行完成：当前 ${currentPlatform}，目标需要 ${target.platforms.join(" / ")}；未启动任务。`,
    });
  }

  private async KtcCreateTask(
    record: KtcRunTargetRecord,
    caaVersion?: string,
    relatedProjectRoots: readonly string[] = [],
  ): Promise<vscode.Task> {
    const native = this.KtcNativeTasks.get(record.id);
    if (record.target.sourceKind === "native-task") {
      if (!native) throw new Error("VS Code 未加载这个原生 Task；请把子项目加入多根工作区或刷新任务提供者。");
      return native;
    }
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(record.project.workspaceRoot));
    const scope = folder ?? vscode.TaskScope.Workspace;
    const environment = caaVersion ? { CAA_MK_VERSION: caaVersion } : undefined;
    let execution: vscode.ProcessExecution | vscode.ShellExecution;
    let problemMatchers = [...record.target.problemMatchers];
    if (record.target.sourceKind === "bundled" && record.target.action === "clang-format") {
      const extension = this.KtcRequireExtensionContext();
      const plan = this.KtcAdapter.createBundledClangFormatLaunchPlan(record.target, {
        resourceRoot: path.join(extension.extensionUri.fsPath, "resources", "run"),
        runtimeProgram: process.execPath,
      });
      execution = new vscode.ProcessExecution(plan.program, [...plan.args], { cwd: plan.cwd, env: { ...plan.env } });
      problemMatchers = [...plan.problemMatchers];
    } else if (record.target.sourceKind === "bundled" && KtcIsCaa(record.target)) {
      const extension = this.KtcRequireExtensionContext();
      const plan = this.KtcAdapter.createBundledCaaLaunchPlan(record.target, {
        platform: KtcPlatform(),
        resourceRoot: path.join(extension.extensionUri.fsPath, "resources", "run"),
        caaVersion: caaVersion ?? "19",
        relatedProjectRoots,
      });
      const installation = this.KtcCaaInstallation(caaVersion ?? "19");
      execution = new vscode.ProcessExecution(plan.program, [...plan.args, ...KtcCaaInstallationArguments(installation)], {
        cwd: plan.cwd,
        env: { ...plan.env },
      });
      problemMatchers = [...plan.problemMatchers];
    } else {
      execution = KtcTaskExecution(record.target, environment);
    }
    const task = new vscode.Task(
      { type: "kt-auto-code-run", target: record.id },
      scope,
      record.target.label,
      "KT Auto Code Run",
      execution,
      problemMatchers,
    );
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      clear: false,
      showReuseMessage: true,
      focus: false,
    };
    if (record.target.action.includes("build")) task.group = vscode.TaskGroup.Build;
    if (record.target.action.includes("test")) task.group = vscode.TaskGroup.Test;
    return task;
  }

  private async KtcPreflightBundledCaa(
    record: KtcRunTargetRecord,
    version: string,
    relatedProjectRoots: readonly string[],
    ctx: ToolRunContext,
  ): Promise<void> {
    if (KtcPlatform() !== "win32") throw new Error("CAA 内置 runner 仅支持 Windows。");
    KtcValidateCaaRunnerPath(record.target.cwd);
    for (const root of relatedProjectRoots) {
      KtcValidateCaaRunnerPath(root);
      try {
        if (!(await stat(root)).isDirectory()) throw new Error("not-directory");
      } catch {
        throw new Error(`关联工程 / Preq 目录不存在：${root}`);
      }
    }
    const external = relatedProjectRoots.filter((root) => !KtcIsWorkspacePath(root));
    if (external.length > 0) {
      const confirmed = await vscode.window.showWarningMessage(
        `关联工程包含 ${external.length} 个工作区外目录，继续进行只读预检？`,
        { modal: true, detail: external.join("\n") },
        "继续预检",
      );
      if (confirmed !== "继续预检") throw new Error("已取消工作区外关联工程的运行。");
    }
    const mode = record.target.action === "caa-build" ? "build" : "run";
    const installation = this.KtcCaaInstallation(version);
    const base = KtcCaaRadeCommandRoot(installation);
    ctx.log(`[Run][CAA] ${mode === "build" ? "内置 MK" : "内置 Run"} · 版本 ${version} · ${KtcCaaRuntimeLabel(installation.runtimeDirectory)} · RADE：${installation.radeRoot} · CATIA：${installation.catiaRoot}`);
    await KtcRequireCaaDirectory(installation.radeRoot, "RADE 根目录", ctx);
    await KtcRequireCaaDirectory(installation.catiaRoot, "CATIA 目录", ctx);
    const required = mode === "build"
      ? ["code/command/tck_init.bat", "TCK/command/tck_profile.bat", "code/command/mkGetPreq.bat", "code/command/mkmk.bat", "code/command/mkrtv.bat"]
      : ["code/command/tck_init.bat", "TCK/command/tck_profile.bat", "code/command/mkCreateRuntimeView.bat", "code/command/mkrun.bat"];
    for (const relative of required) {
      try {
        await access(path.win32.join(base, ...relative.split("/")));
      } catch {
        const missing = path.win32.join(base, ...relative.split("/"));
        ctx.log(`[ERROR] CAA：RADE ${KtcCaaRuntimeLabel(installation.runtimeDirectory)} 的厂商脚本缺失：${missing}`);
        throw new Error(`CAA 预检停止：RADE 厂商脚本缺失：${missing}`);
      }
    }
  }

  private KtcStopRun(runId: string, ctx: ToolRunContext): void {
    const record = this.KtcExecutions.get(runId);
    if (!record || !KtcIsActive(record.state)) throw new Error("运行项已结束或不存在。");
    record.state = "stopping";
    record.execution.terminate();
    this.KtcPostState(ctx);
    ctx.log(`[Run][stop] runId=${runId} requested=true`);
  }

  private async KtcSetCaaVersion(projectId: string, rawValue: string, ctx: ToolRunContext): Promise<void> {
    const project = this.KtcProjects.get(projectId);
    if (!project || !project.project.kinds.includes("caa")) throw new Error("CAA 项目已变化，请刷新。");
    const value = this.KtcAdapter.resolveCaaVersion({ explicit: rawValue }).value;
    const context = this.KtcRequireExtensionContext();
    const values = { ...(context.workspaceState.get<Record<string, string>>(KtcCaaVersionSelectionStateKey) ?? {}) };
    values[projectId] = value;
    await context.workspaceState.update(KtcCaaVersionSelectionStateKey, values);
    this.KtcPostState(ctx);
    ctx.log(`[Run][selection] project=${projectId} caaVersion=${value} storage=workspaceState`);
  }

  private async KtcSetCaaRuntimeDirectory(value: string, ctx: ToolRunContext): Promise<void> {
    const installation = KtcResolveCaaInstallation({ version: "19", runtimeDirectory: value });
    await vscode.workspace.getConfiguration("ktAutoCode.run").update(
      "caaRuntimeDirectory",
      installation.runtimeDirectory,
      vscode.ConfigurationTarget.Global,
    );
    ctx.log(`[Run][configuration] caaRuntimeDirectory=${installation.runtimeDirectory} platform=${KtcCaaRuntimeLabel(installation.runtimeDirectory)} storage=user-settings`);
    this.KtcPostState(ctx);
  }

  private async KtcSelectCaaRelated(projectId: string, ctx: ToolRunContext): Promise<void> {
    const project = this.KtcRequireCaaProject(projectId);
    const selectedRoots = this.KtcCaaRelatedRoots(projectId);
    const selectedKeys = new Set(selectedRoots.map(KtcPathKey));
    const discovered = [...this.KtcProjects.values()]
      .filter((candidate) => candidate.id !== projectId)
      .sort((left, right) => left.project.label.localeCompare(right.project.label));
    const discoveredKeys = new Set(discovered.map((candidate) => KtcPathKey(candidate.project.rootUri)));
    const items: Array<vscode.QuickPickItem & { readonly root: string }> = discovered.map((candidate) => ({
      label: candidate.project.label,
      description: candidate.project.relativePath,
      detail: candidate.project.rootUri,
      root: candidate.project.rootUri,
      picked: selectedKeys.has(KtcPathKey(candidate.project.rootUri)),
    }));
    for (const root of selectedRoots.filter((value) => !discoveredKeys.has(KtcPathKey(value)))) {
      items.push({ label: path.basename(root), description: "外部或未发现目录", detail: root, root, picked: true });
    }
    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: `${project.project.label} · MK 关联工程 / Preq`,
      placeHolder: "勾选后由内置 CAA runner 作为 mkGetPreq -p 输入；清空即恢复默认 provider",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) return;
    const roots = KtcUniquePaths(picked.map((item) => item.root));
    await this.KtcStoreCaaRelatedRoots(projectId, roots);
    this.KtcPostState(ctx);
    ctx.log(`[Run][config] project=${projectId} relatedProjectRoots=${roots.length}`);
  }

  private async KtcAddCaaRelatedFolder(projectId: string, ctx: ToolRunContext): Promise<void> {
    const project = this.KtcRequireCaaProject(projectId);
    const selected = await vscode.window.showOpenDialog({
      title: `${project.project.label} · 添加 MK 关联工程 / Preq 目录`,
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: true,
      openLabel: "添加关联目录",
    });
    if (!selected || selected.length === 0) return;
    const roots = selected.filter((uri) => uri.scheme === "file").map((uri) => path.resolve(uri.fsPath));
    for (const root of roots) KtcValidateCaaRunnerPath(root);
    const external = roots.filter((root) => !KtcIsWorkspacePath(root));
    if (external.length > 0) {
      const confirmed = await vscode.window.showWarningMessage(
        `将添加 ${external.length} 个工作区外目录作为 CAA Preq，是否继续？`,
        { modal: true, detail: external.join("\n") },
        "确认添加",
      );
      if (confirmed !== "确认添加") return;
    }
    const values = KtcUniquePaths([...this.KtcCaaRelatedRoots(projectId), ...roots])
      .filter((root) => KtcPathKey(root) !== KtcPathKey(project.project.rootUri));
    await this.KtcStoreCaaRelatedRoots(projectId, values);
    this.KtcPostState(ctx);
    ctx.log(`[Run][config] project=${projectId} relatedProjectRoots=${values.length}`);
  }

  private KtcRequireCaaProject(projectId: string): KtcRunProjectRecord {
    const project = this.KtcProjects.get(projectId);
    if (!project || !project.project.kinds.includes("caa")) throw new Error("CAA 项目已变化，请刷新。");
    return project;
  }

  private KtcCaaRelatedRoots(projectId: string): string[] {
    const project = this.KtcProjects.get(projectId);
    const currentRoot = project?.project.rootUri;
    if (!project || !currentRoot) return [];
    const configuration = KtcRunConfiguration(project);
    const projectSetting = KtcCaaProjectSettingFor(configuration, project);
    const inspected = configuration.inspect<readonly string[]>("caaRelatedProjects");
    const folderDefault = inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;
    const configured = projectSetting?.caaRelatedProjects
      ?? (this.KtcRequiresPerProjectSetting(project) ? undefined : folderDefault);
    const legacy = this.KtcRequireExtensionContext().workspaceState
      .get<Record<string, readonly string[]>>(KtcLegacyCaaRelatedStateKey)?.[projectId];
    const values = Array.isArray(configured) ? configured : legacy ?? [];
    return KtcResolveCaaRelatedProjects(
      currentRoot,
      values.filter((value): value is string => typeof value === "string"),
    );
  }

  private async KtcStoreCaaRelatedRoots(projectId: string, roots: readonly string[]): Promise<void> {
    const project = this.KtcRequireCaaProject(projectId);
    const values = KtcSerializeCaaRelatedProjects(project.project.rootUri, roots);
    const configuration = KtcRunConfiguration(project);
    if (this.KtcRequiresPerProjectSetting(project)) {
      const projects = { ...KtcCaaProjectSettings(configuration) };
      projects[KtcCaaProjectSettingKey(project)] = {
        ...projects[KtcCaaProjectSettingKey(project)],
        caaRelatedProjects: values,
      };
      await configuration.update("caaProjects", projects, vscode.ConfigurationTarget.WorkspaceFolder);
    } else {
      await configuration.update("caaRelatedProjects", values, vscode.ConfigurationTarget.WorkspaceFolder);
    }
    await this.KtcRemoveLegacyProjectValue(KtcLegacyCaaRelatedStateKey, projectId);
  }

  private async KtcRemoveLegacyProjectValue(key: string, projectId: string): Promise<void> {
    const context = this.KtcRequireExtensionContext();
    const values = { ...(context.workspaceState.get<Record<string, unknown>>(key) ?? {}) };
    if (!(projectId in values)) return;
    delete values[projectId];
    await context.workspaceState.update(key, Object.keys(values).length > 0 ? values : undefined);
  }

  private async KtcOpenSource(targetId: string): Promise<void> {
    const source = this.KtcTargets.get(targetId)?.target.sourceUri;
    if (!source) throw new Error("这个目标没有可打开的来源文件。");
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(source));
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private async KtcMatchNativeTasks(): Promise<void> {
    let tasks: readonly vscode.Task[] = [];
    try {
      tasks = await vscode.tasks.fetchTasks();
    } catch (error) {
      this.KtcDiagnostics.push(`native-task-fetch-failed: ${KtcErrorMessage(error)}`);
      return;
    }
    for (const record of this.KtcTargets.values()) {
      if (record.target.sourceKind !== "native-task") continue;
      const task = tasks.find((candidate) => candidate.name === record.target.label && KtcTaskMatchesRoot(candidate, record.project.workspaceRoot));
      if (task) this.KtcNativeTasks.set(record.id, task);
    }
  }

  private KtcDisplayTargets(targets: readonly KtcPnwRunTarget[]): Array<{
    readonly target: KtcPnwRunTarget;
    readonly alternatives: readonly KtcPnwRunTarget[];
  }> {
    const plain = targets
      .filter((target) => !KtcLogicalRunActions.has(target.action))
      .map((target) => ({ target, alternatives: [] as readonly KtcPnwRunTarget[] }));
    const logical = this.KtcAdapter.groupTargets(targets.filter((target) => KtcLogicalRunActions.has(target.action)));
    return KtcSelectRunDisplayTargets(plain.map((item) => item.target), logical);
  }

  private KtcOnEndProcess(event: vscode.TaskProcessEndEvent): void {
    const record = this.KtcExecutionFor(event.execution);
    if (!record) return;
    record.exitCode = event.exitCode;
    record.state = record.state === "stopping"
      ? "terminated"
      : event.exitCode === undefined ? "ended-unknown" : event.exitCode === 0 ? "succeeded" : "failed";
    this.KtcLastRunContext?.log(KtcRunCompletionMessage(record, event.exitCode));
    this.KtcPostLastState();
  }

  private KtcOnEndTask(event: vscode.TaskEndEvent): void {
    const record = this.KtcExecutionFor(event.execution);
    if (!record) return;
    if (KtcIsActive(record.state)) {
      record.state = record.state === "stopping" ? "terminated" : "ended-unknown";
      this.KtcLastRunContext?.log(KtcRunCompletionMessage(record));
    }
    this.KtcRunByExecution.delete(event.execution);
    this.KtcPostLastState();
  }

  private KtcExecutionFor(execution: vscode.TaskExecution): KtcRunExecutionRecord | undefined {
    const runId = this.KtcRunByExecution.get(execution);
    return runId ? this.KtcExecutions.get(runId) : undefined;
  }

  private KtcCaaVersion(project: KtcRunProjectRecord): { readonly value: string; readonly source: string } {
    const context = this.KtcRequireExtensionContext();
    const configuration = KtcRunConfiguration(project);
    const configured = configuration.inspect<string>("caaVersion")?.globalValue?.trim();
    const selected = context.workspaceState.get<Record<string, string>>(KtcCaaVersionSelectionStateKey)?.[project.id];
    const resolved = this.KtcAdapter.resolveCaaVersion({
      explicit: selected || configured,
      environment: process.env.CAA_MK_VERSION,
      suggested: "19",
    });
    return {
      value: resolved.value,
      source: selected
        ? "当前工作区"
        : configured ? "插件默认" : resolved.source === "environment" ? "环境" : "建议",
    };
  }

  private KtcCaaInstallation(version: string) {
    const configuration = vscode.workspace.getConfiguration("ktAutoCode.run");
    return KtcResolveCaaInstallation({
      version,
      radeRoot: configuration.get<string>("caaRadeRoot"),
      catiaRoot: configuration.get<string>("caaCatiaRoot"),
      runtimeDirectory: configuration.get<string>("caaRuntimeDirectory"),
    });
  }

  private KtcProjectInputs(): KtcRunProjectInput[] {
    return [...this.KtcProjects.values()].map((record) => {
      const caa = record.project.kinds.includes("caa") ? this.KtcCaaVersion(record) : undefined;
      const relatedRoots = caa ? this.KtcCaaRelatedRoots(record.id) : [];
      const targets = [...this.KtcTargets.values()]
        .filter((target) => target.project.id === record.id)
        .sort((left, right) => right.target.priority - left.target.priority || left.target.label.localeCompare(right.target.label))
        .map((target): KtcRunTargetInput => {
          return {
            id: target.id,
            projectId: record.id,
            title: target.target.label,
            action: target.target.action,
            sourceKind: target.target.sourceKind,
            sourceUri: target.target.sourceUri,
            relativePath: target.target.sourceUri
              ? KtcSlash(path.relative(record.project.rootUri, target.target.sourceUri)) || path.basename(target.target.sourceUri)
              : target.target.action,
            platforms: target.target.platforms,
            cwd: target.target.cwd,
            program: target.target.program,
            args: target.target.args,
            envKeys: target.target.envKeys,
            problemMatchers: target.target.problemMatchers,
            matcherFidelity: target.target.matcherFidelity,
            risk: target.target.risk,
            ...(!this.KtcNativeTasks.has(target.id) && target.target.sourceKind === "native-task"
              ? { disabledReason: "native-task-not-loaded" }
              : target.target.disabledReason ? { disabledReason: target.target.disabledReason } : {}),
          };
        });
      return {
        id: record.id,
        name: record.project.label,
        relativePath: record.project.relativePath,
        kinds: record.project.kinds,
        ...(caa ? { caaVersion: caa.value, caaVersionSource: caa.source } : {}),
        ...(caa ? { caaRuntimeDirectory: this.KtcCaaInstallation(caa.value).runtimeDirectory } : {}),
        ...(caa ? {
          relatedProjectCount: relatedRoots.length,
          relatedProjectSummary: relatedRoots.map((root) => [...this.KtcProjects.values()]
            .find((candidate) => KtcPathKey(candidate.project.rootUri) === KtcPathKey(root))?.project.label ?? root).join("、"),
        } : {}),
        targets,
      };
    });
  }

  private KtcRequiresPerProjectSetting(project: KtcRunProjectRecord): boolean {
    return [...this.KtcProjects.values()].filter((candidate) => candidate.workspaceRoot === project.workspaceRoot
      && candidate.project.kinds.includes("caa")).length > 1;
  }

  private KtcPostState(ctx: ToolRunContext, status: ToolUiState["status"] = "done", message?: string): void {
    const run: KtcRunViewModel = KtcCreateRunModel({
      platform: KtcPlatform(),
      trusted: vscode.workspace.isTrusted,
      projects: this.KtcProjectInputs(),
      executions: [...this.KtcExecutions.values()].map(KtcExecutionView),
      diagnostics: this.KtcDiagnostics,
      incomplete: this.KtcIncomplete,
    });
    ctx.postState({ status, message: message ?? run.statusText, run });
  }

  private KtcPostLastState(): void {
    if (this.KtcLastRunContext) this.KtcPostState(this.KtcLastRunContext);
  }

  private KtcTrimExecutionHistory(): void {
    const completed = [...this.KtcExecutions.values()].filter((record) => !KtcIsActive(record.state));
    for (const record of completed.slice(0, Math.max(0, completed.length - 30))) this.KtcExecutions.delete(record.runId);
  }

  private KtcRequireExtensionContext(): vscode.ExtensionContext {
    if (!this.KtcExtensionContext) throw new Error("Run controller 尚未注册 ExtensionContext。");
    return this.KtcExtensionContext;
  }
}

function KtcTaskExecution(target: KtcPnwRunTarget, env?: Record<string, string>): vscode.ProcessExecution | vscode.ShellExecution {
  const rawProgram = target.program;
  if (!rawProgram) throw new Error("目标缺少可执行 program；复杂 compound/第三方 task 必须由 VS Code 原生加载。");
  const program = KtcResolveProgram(rawProgram, target.cwd);
  if (target.sourceKind === "imported-task") {
    return new vscode.ShellExecution(program, [...target.args], { cwd: target.cwd, env });
  }
  const extension = path.extname(program).toLowerCase();
  if (extension === ".ps1") {
    return new vscode.ProcessExecution("powershell.exe", ["-NoProfile", "-File", program, ...target.args], { cwd: target.cwd, env });
  }
  if (extension === ".bat" || extension === ".cmd") {
    return new vscode.ProcessExecution("cmd.exe", ["/d", "/s", "/c", program, ...target.args], { cwd: target.cwd, env });
  }
  if (extension === ".sh") {
    return new vscode.ProcessExecution("/bin/sh", [program, ...target.args], { cwd: target.cwd, env });
  }
  return new vscode.ProcessExecution(program, [...target.args], { cwd: target.cwd, env });
}

function KtcResolveProgram(program: string, cwd: string): string {
  const replaced = program.replace(/^\$\{workspaceFolder\}[\\/]?/u, "");
  if (path.isAbsolute(replaced) || /^[A-Za-z]:[\\/]/u.test(replaced)) return replaced;
  if (replaced.includes("/") || replaced.includes("\\") || replaced.startsWith(".")) return path.resolve(cwd, replaced);
  return replaced;
}

function KtcTaskMatchesRoot(task: vscode.Task, workspaceRoot: string): boolean {
  if (typeof task.scope === "object" && "uri" in task.scope) return task.scope.uri.fsPath === workspaceRoot;
  return true;
}

function KtcExecutionView(record: KtcRunExecutionRecord): KtcRunExecution {
  return {
    runId: record.runId,
    targetId: record.target.id,
    projectId: record.target.project.id,
    label: record.target.target.label,
    state: record.state,
    ...(record.exitCode !== undefined ? { exitCode: record.exitCode } : {}),
  };
}

const KtcLogicalRunActions = new Set([
  "caa-build",
  "caa-run",
  "cmake-configure",
  "cmake-build",
  "cmake-test",
  "cmake-clean",
]);

function KtcBundledCaaRecord(record: KtcRunTargetRecord): KtcRunTargetRecord {
  const selected = KtcSelectRunExecutionProvider(
    { target: record.target, alternatives: record.alternatives },
    { requireBundledCaaBuild: true },
  );
  return {
    ...record,
    target: selected.target,
    alternatives: selected.alternatives,
  };
}

function KtcPlatform(): KtcRunPlatform {
  return process.platform === "win32" || process.platform === "darwin" ? process.platform : "linux";
}

function KtcScopedId(workspaceRoot: string, localId: string): string {
  return `${vscode.Uri.file(workspaceRoot).toString()}#${localId}`;
}

function KtcRunConfiguration(project: KtcRunProjectRecord): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("ktAutoCode.run", vscode.Uri.file(project.project.rootUri));
}

function KtcCaaProjectSettingKey(project: KtcRunProjectRecord): string {
  return project.project.relativePath || ".";
}

function KtcCaaProjectSettings(configuration: vscode.WorkspaceConfiguration): KtcCaaProjectsSetting {
  const value = configuration.get<unknown>("caaProjects");
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const settings: Record<string, KtcCaaProjectSetting> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!key || key.length > 500 || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const caaRelatedProjects = Array.isArray(record.caaRelatedProjects)
      ? record.caaRelatedProjects.filter((entry): entry is string => typeof entry === "string")
      : undefined;
    settings[key] = {
      ...(caaRelatedProjects ? { caaRelatedProjects } : {}),
    };
  }
  return settings;
}

function KtcCaaProjectSettingFor(
  configuration: vscode.WorkspaceConfiguration,
  project: KtcRunProjectRecord,
): KtcCaaProjectSetting | undefined {
  return KtcCaaProjectSettings(configuration)[KtcCaaProjectSettingKey(project)];
}

function KtcIsCaa(target: KtcPnwRunTarget): boolean {
  return target.action === "caa-build" || target.action === "caa-run";
}

function KtcIsActive(state: KtcRunExecutionState): boolean {
  return state === "starting" || state === "running" || state === "stopping";
}

function KtcSafeCaaVersion(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/^[A-Za-z]/u, "");
  return normalized && /^\d{2,4}$/u.test(normalized) ? normalized : undefined;
}

function KtcRunCompletionMessage(record: KtcRunExecutionRecord, exitCode?: number): string {
  const duration = KtcFormatRunDuration(Date.now() - record.startedAt);
  if (record.state === "succeeded") return `[Run] ✓ ${record.target.target.label} · 成功 · ${duration}`;
  if (record.state === "failed") return `[ERROR] Run：${record.target.target.label} 失败（退出码 ${exitCode ?? "未知"}，${duration}）；请查看终端错误。`;
  if (record.state === "terminated") return `[Run] ■ ${record.target.target.label} · 已停止 · ${duration}`;
  return `[Run] ? ${record.target.target.label} · 结束状态未知 · ${duration}；请查看终端。`;
}

function KtcFormatRunDuration(value: number): string {
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} 秒`;
}

async function KtcRequireCaaDirectory(directory: string, label: string, ctx: ToolRunContext): Promise<void> {
  try {
    if ((await stat(directory)).isDirectory()) return;
  } catch {
    // The diagnostic below is the user-facing preflight evidence.
  }
  const message = label === "RADE 根目录"
    ? `CAA：RADE 未安装或根目录不可访问：${directory}`
    : `CAA：CATIA 未安装或目录不可访问：${directory}`;
  ctx.log(`[ERROR] ${message}`);
  throw new Error(`预检停止：${message}`);
}

function KtcValidateCaaRunnerPath(value: string): void {
  if (!path.isAbsolute(value) || /[;"&|<>^%\r\n]/u.test(value)) {
    throw new Error(`CAA runner 不接受该目录路径：${value}`);
  }
}

function KtcUniquePaths(values: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const normalized = path.normalize(path.resolve(value));
    if (!unique.has(KtcPathKey(normalized))) unique.set(KtcPathKey(normalized), normalized);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

function KtcPathKey(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}

function KtcIsWorkspacePath(value: string): boolean {
  return (vscode.workspace.workspaceFolders ?? []).some((folder) => KtcIsInside(folder.uri.fsPath, value));
}

function KtcIsInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function KtcDisabledReason(value: string): string {
  const labels: Record<string, string> = {
    "nested-task-requires-native-provider": "嵌套 Task 使用了公开 API 无法重建的类型或没有 command；请把子项目加入多根工作区。",
    "native-task-not-loaded": "VS Code 尚未加载这个原生 Task；请刷新或检查工作区配置。",
  };
  return labels[value] ?? value;
}

function KtcSlash(value: string): string {
  return value.split(path.sep).join("/");
}

function KtcErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function KtcDisplayPath(value: string): string {
  const resolved = path.resolve(value);
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (!KtcIsInside(folder.uri.fsPath, resolved)) continue;
    const relative = KtcSlash(path.relative(folder.uri.fsPath, resolved));
    return `<workspace:${folder.name}>${relative ? `/${relative}` : ""}`;
  }
  return `<external>/${path.basename(resolved)}`;
}

function KtcRunLogArgument(value: string, index: number, values: readonly string[]): string {
  const previous = values[index - 1] ?? "";
  if (/^(?:--?)?(?:password|passwd|secret|token|api[-_]?key)$/iu.test(previous)) return "<redacted>";
  let singleLine = value.replace(/[\r\n\t]+/gu, " ");
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    singleLine = singleLine.split(folder.uri.fsPath).join(`<workspace:${folder.name}>`);
  }
  const userRoot = process.env.HOME || process.env.USERPROFILE;
  if (userRoot) singleLine = singleLine.split(userRoot).join("<home>");
  singleLine = singleLine.slice(0, 240);
  if (/(?:password|passwd|secret|token|api[-_]?key)\s*=/iu.test(singleLine)) return "<redacted>";
  return /\s/u.test(singleLine) ? JSON.stringify(singleLine) : singleLine;
}

function KtcRunLogIdentity(value: string): string {
  let safe = value.replace(/[\r\n\t]+/gu, " ");
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    safe = safe
      .split(folder.uri.toString()).join(`<workspace:${folder.name}>`)
      .split(folder.uri.fsPath).join(`<workspace:${folder.name}>`);
  }
  const userRoot = process.env.HOME || process.env.USERPROFILE;
  if (userRoot) safe = safe.split(userRoot).join("<home>");
  return safe.slice(0, 320);
}
