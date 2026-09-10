import * as PnwCodeCoreUiImport from "@phoenix-wing/code-core/ui";
import type { KtcCleanupDialogHostAction, KtcCleanupDialogModel, KtcCleanupDialogRequest } from "../../src/core/cleanupContracts.js";
import { KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH, ktcParseRootCleanupConfigurationYaml } from "../../src/core/rootCleanupPatterns.js";
import { PREVIEW_AUTO_BUILD_SAMPLE, type PreviewAutoBuildSample } from "./previewAutoBuildSample.js";
import type { PreviewAutoBuildState } from "./previewAutoBuildState.js";
import { ktcDefineCleanupYamlWorkspace, type KtcCleanupYamlWorkspace, type KtcCleanupYamlAction } from "../../src/ui/KtcCleanupYamlWorkspace.js";
import { PreviewCleanupYamlWorkspace, type PreviewCleanupYamlDiscoveryLimits } from "./previewCleanupYamlWorkspace.js";

export type PreviewAutoBuildCleanupMode = "rules" | "git-force" | "cmake";

interface PreviewAutoBuildCleanupDialog extends HTMLElement {
  model: KtcCleanupDialogModel;
  showModal(modeId?: string): void;
  close(): void;
}

type PreviewAutoBuildCleanupAction = KtcCleanupDialogHostAction
  | { readonly kind: "change-mode"; readonly modeId: string }
  | { readonly kind: "toggle-target"; readonly targetId: string; readonly selected: boolean }
  | { readonly kind: "change-rules"; readonly rulesYaml: string };

/** Browser-only fixture projection. Never import the formal Node path/provider implementation here. */
export function createPreviewAutoBuildCleanupModel(
  state: PreviewAutoBuildState,
  modeId: PreviewAutoBuildCleanupMode = "rules",
  sample: PreviewAutoBuildSample = PREVIEW_AUTO_BUILD_SAMPLE,
): KtcCleanupDialogModel {
  const target = (id: string, label: string, path: string, mode: PreviewAutoBuildCleanupMode) => ({
    id, label, path, selected: mode === modeId, supportedModeIds: [mode],
  });
  return {
    title: "清理",
    description: "内存样例：不读取或删除真实文件。每份 YAML 以所在目录为根，仅处理直属项；行内清理直接执行。",
    modes: [
      { id: "rules", label: "规则产物", description: "按 YAML 规则清理 ROOT 或工作目录的直属构建产物（模拟）。", risk: "normal", rulesVisible: true },
      { id: "git-force", label: "Git 强制恢复", description: "reset --hard HEAD + clean -ffdx；真实操作会丢弃未提交、未跟踪及忽略内容。此处仅模拟。", risk: "high", rulesVisible: false },
      { id: "cmake", label: "CMake 产物", description: "项目 build 目录产物清理（模拟）。", risk: "normal", rulesVisible: false },
    ],
    selectedModeId: modeId,
    modePresentation: "radio",
    collapsibleSections: true,
    actionsPlacement: "header",
    targets: [
      target("rules:root", "ROOT_DIR", sample.configuration.rootDirectory, "rules"),
      target("rules:working", "工作目录", sample.configuration.workingDirectory, "rules"),
      ...sample.repositories.map(({ id, name, path }) => target(`git:${id}`, name, path, "git-force")),
      ...sample.repositories.filter(({ operations }) => operations.some(({ id, enabled }) => id === "cmake" && enabled))
        .map(({ id, name, path }) => target(`cmake:${id}`, name, `${path}/build`, "cmake")),
    ],
    rulesVisible: modeId === "rules", rulesLabel: "清理规则", rulesYaml: state.cleanupPatternsYaml,
    preview: { state: "idle", message: "先选择清理方式和目标，再预览样例清单。", items: [] },
    previewEnabled: state.phase !== "running", executeEnabled: false,
    previewLabel: "预览", executeLabel: modeId === "git-force" ? "强制清理" : "清理", cancelLabel: "取消",
    // Run alone opted out. AutoBuild must retain Wing's explicit high-risk confirmation.
    requireHighRiskConfirmation: true,
    highRiskConfirmationLabel: "我已核对预览，确认丢弃所选仓库的未提交、未跟踪及忽略内容。",
  };
}

/** The real Wing dialog with an in-memory Host. No filesystem, Git, or formal cleanup calls. */
export function createPreviewAutoBuildCleanupSurface(options: {
  readonly state: () => PreviewAutoBuildState;
  readonly updateRules: (value: string) => void;
  readonly execute: (mode: PreviewAutoBuildCleanupMode) => void;
  readonly log: (message: string) => void;
  readonly sample?: PreviewAutoBuildSample;
  readonly discoveryLimits?: PreviewCleanupYamlDiscoveryLimits;
}): { open(modeId?: PreviewAutoBuildCleanupMode): void; close(): void } {
  let dialog: PreviewAutoBuildCleanupDialog | undefined;
  let workspaceElement: KtcCleanupYamlWorkspace | undefined;
  const sample = options.sample ?? PREVIEW_AUTO_BUILD_SAMPLE;
  const workingDirectory = () => options.state().session.draft.configuration.workingDirectory;
  let yamlWorkspace = new PreviewCleanupYamlWorkspace(options.state().cleanupPatternsYaml, workingDirectory());
  let notice = "";
  let sequence = 0;
  let active = false;
  let openedContext = "";
  let frozen: { token: string; request: string; context: string } | undefined;
  const context = () => JSON.stringify([options.state().cleanupPatternsYaml, options.state().rootEnabled, options.state().thirdPartyEnabled, workingDirectory()]);
  const requestKey = (request: KtcCleanupDialogRequest) => JSON.stringify([request.modeId, [...request.targetIds].sort(), request.rulesYaml]);
  const renderWorkspace = (): void => {
    const discovery = yamlWorkspace.discover(options.discoveryLimits);
    notice = `探测到 ${discovery.sources.length} 份 cleanup.yaml（内存样例）${discovery.incomplete ? " · 不完整，详情见日志" : ""}`;
    dialog?.querySelectorAll<HTMLButtonElement>('[data-cleanup-yaml-action]').forEach((button) => {
      button.disabled = options.state().phase === "running";
    });
    if (workspaceElement) workspaceElement.model = {
      sources: discovery.sources,
      busy: options.state().phase === "running", notice,
    };
  };
  const logDiscovery = (): void => {
    const discovery = yamlWorkspace.discover(options.discoveryLimits);
    options.log(`[编译工具][YAML 探测][模拟] 仅从当前工作目录向下：${workingDirectory()}；发现 ${discovery.sources.length} 份 cleanup.yaml${discovery.incomplete ? "；探测不完整" : ""}；不扫描真实目录。`);
    for (const warning of discovery.warnings) options.log(`[编译工具][YAML 探测][跳过/限额][模拟] ${warning}`);
  };
  const handleYaml = (event: Event): void => {
    const action = (event as CustomEvent<KtcCleanupYamlAction>).detail;
    if (!active || !dialog || !action) return;
    if (options.state().phase === "running" || openedContext !== context()) {
      fail("编译配置已变化或任务运行中，请重新打开清理（模拟）。"); return;
    }
    try {
      if ((action.kind === "open-source" || action.kind === "clean-source")
        && !yamlWorkspace.discover(options.discoveryLimits).sources.some(({ id }) => id === action.sourceId)) {
        throw new Error("未找到当前探测中的 YAML 样例，请重新探测。");
      }
      if (action.kind === "edit-rules") {
        notice = `编辑请求（模拟）：当前 ${yamlWorkspace.yaml.length} 字符作为未保存的 YAML 文档交给 VS Code，由用户自行保存；没有插件保存对话框。`;
        options.log(`[编译工具] ${notice}\n[YAML 草稿（模拟）]\n${yamlWorkspace.yaml}`);
      } else if (action.kind === "discover") {
        logDiscovery();
      } else if (action.kind === "open-source") {
        const file = yamlWorkspace.open(action.sourceId);
        notice = `打开请求（模拟）：${file.path}。正式接入后交给 VS Code 原生编辑器；清理框不内置文件编辑。`;
        options.log(`[编译工具] ${notice}`);
      } else if (action.kind === "clean-source") {
        // One semantic source ID + revision, never a path/root provided by the View.
        frozen = undefined;
        const items = yamlWorkspace.clean(action.sourceId, action.revision);
        notice = `已直接清理 ${items.length} 个样例项，无额外确认；未删除真实文件。`;
        dialog.model = { ...dialog.model, executeEnabled: false,
          preview: { state: "complete", summary: "逐配置模拟清理完成", message: notice, items } };
        options.log(`[编译工具] ${notice}`);
      }
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
      fail(notice);
    }
    renderWorkspace();
  };
  const cancel = (): void => {
    if (!active) return;
    active = false;
    frozen = undefined;
    dialog?.close();
    if (dialog) dialog.model = { ...dialog.model, executeEnabled: false, preview: { state: "idle", message: "已取消；未删除真实文件。", items: [] } };
    options.log("[编译工具] 已取消清理（模拟）；未删除真实文件，未执行 Git 命令");
  };
  const fail = (message: string): void => {
    frozen = undefined;
    if (dialog) dialog.model = { ...dialog.model, executeEnabled: false, preview: { state: "error", message, items: [] } };
    options.log(`[编译工具] ${message}`);
  };
  const handle = (event: Event): void => {
    const detail = (event as CustomEvent<PreviewAutoBuildCleanupAction>).detail;
    if (!dialog || !active || !detail) return;
    if (detail.kind === "cancel") { cancel(); return; }
    // A late edit must not silently adopt a changed build context and revive its old preview.
    if (options.state().phase === "running") { fail("编译运行中，清理预览已失效（模拟）。"); return; }
    if (context() !== openedContext) { fail("编译配置已变化，请重新打开清理（模拟）。"); return; }
    if (detail.kind === "change-rules") {
      frozen = undefined;
      yamlWorkspace.edit(detail.rulesYaml.slice(0, KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH));
      options.updateRules(detail.rulesYaml.slice(0, KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH));
      openedContext = context();
      renderWorkspace();
      options.log("[编译工具] 清理规则已缓存到预览会话（模拟）；旧预览失效");
      return;
    }
    if (detail.kind === "change-mode" || detail.kind === "toggle-target") {
      frozen = undefined;
      dialog.model = { ...dialog.model, executeEnabled: false,
        executeLabel: dialog.model.selectedModeId === "git-force" ? "强制清理" : "清理" };
      options.log(`[编译工具] ${detail.kind === "change-mode" ? "切换清理方式" : "选择清理目标"}（模拟）；请重新预览`);
      return;
    }
    if (detail.kind !== "preview" && detail.kind !== "execute") return;
    if (options.state().phase === "running") { fail("编译运行中，清理预览已失效（模拟）。"); return; }
    if (context() !== openedContext) { fail("编译配置已变化，请重新打开清理（模拟）。"); return; }
    const request = detail.request;
    if (!request || typeof request.modeId !== "string" || !Array.isArray(request.targetIds)
      || !request.targetIds.every((id) => typeof id === "string") || typeof request.rulesYaml !== "string") {
      fail("清理请求不完整，请重新预览（模拟）。"); return;
    }
    const selected = dialog.model.targets.filter(({ id, selected, disabled, supportedModeIds }) => selected && !disabled
      && supportedModeIds?.includes(request.modeId) && request.targetIds.includes(id));
    if (!request.targetIds.length || new Set(request.targetIds).size !== request.targetIds.length
      || selected.length !== request.targetIds.length || request.modeId !== dialog.model.selectedModeId
      || request.rulesYaml !== dialog.model.rulesYaml || request.rulesYaml.length > KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH) {
      fail("清理方式、目标或规则已变化，请重新预览（模拟）。"); return;
    }
    if (detail.kind === "preview") {
      if (request.modeId === "rules" && !request.rulesYaml.trim()) { fail("请先填写清理 YAML 规则（模拟）。"); return; }
      if (request.modeId === "rules") {
        try { ktcParseRootCleanupConfigurationYaml(request.rulesYaml); }
        catch (error) { fail(error instanceof Error ? error.message : String(error)); return; }
      }
      const items = request.modeId === "rules"
        ? selected.flatMap(({ path }) => [`${path}/objects（样例）`, `${path}/build（样例）`, `${path}/module.obj（样例）`])
        : request.modeId === "git-force"
          ? selected.map(({ path }) => `${path} · reset --hard HEAD + clean -ffdx（样例）`)
          : selected.map(({ path }) => `${path}（样例）`);
      const token = `preview-auto-build:${++sequence}`;
      frozen = { token, request: requestKey(request), context: context() };
      dialog.model = { ...dialog.model, executeEnabled: true,
        preview: { state: "ready", token, summary: `${items.length} 个待处理样例项`,
          message: "固定样例仅演示清单交互，不代表真实 YAML 匹配结果；不访问文件系统。", items } };
      options.log(`[编译工具] 清理预览：${items.length} 项（模拟）`);
    } else {
      if (!frozen || detail.previewToken !== frozen.token || frozen.request !== requestKey(request)
        || frozen.context !== context() || dialog.model.preview.state !== "ready" || dialog.model.preview.token !== frozen.token) {
        fail("清理预览已过期，请重新预览（模拟）。"); return;
      }
      frozen = undefined;
      options.execute(request.modeId as PreviewAutoBuildCleanupMode);
      dialog.model = { ...dialog.model, executeEnabled: false,
        preview: { state: "complete", summary: "模拟清理完成", message: "未删除真实文件、未执行真实命令；正式端会逐项输出结果。", items: dialog.model.preview.items } };
    }
  };
  return {
    open(modeId = "rules"): void {
      if (options.state().phase === "running") { options.log("[编译工具] 编译运行中，不能打开清理（模拟）"); return; }
      if (!dialog) {
        (PnwCodeCoreUiImport as unknown as { pnwCodeDefineCleanupDialog(): void }).pnwCodeDefineCleanupDialog();
        dialog = document.createElement("pnw-cleanup-dialog") as PreviewAutoBuildCleanupDialog;
        dialog.id = "preview-auto-build-cleanup-dialog";
        dialog.addEventListener("pnw-cleanup-dialog-action", handle);
        ktcDefineCleanupYamlWorkspace();
        workspaceElement = document.createElement("ktc-cleanup-yaml-workspace") as KtcCleanupYamlWorkspace;
        workspaceElement.slot = "workspace";
        dialog.addEventListener("ktc-cleanup-yaml-action", handleYaml);
        dialog.append(workspaceElement);
        for (const [kind, text] of [["edit-rules", "在 VS Code 中编辑"], ["discover", "探测配置"]] as const) {
          const button = document.createElement("button");
          button.type = "button"; button.slot = "header-actions"; button.textContent = text;
          button.dataset.cleanupYamlAction = kind;
          button.onclick = () => button.dispatchEvent(new CustomEvent("ktc-cleanup-yaml-action", { detail: { kind }, bubbles: true, composed: true }));
          dialog.append(button);
        }
        document.body.append(dialog);
      }
      active = true;
      frozen = undefined;
      openedContext = context();
      if (yamlWorkspace.workingDirectory !== workingDirectory()) yamlWorkspace = new PreviewCleanupYamlWorkspace(options.state().cleanupPatternsYaml, workingDirectory());
      yamlWorkspace.edit(options.state().cleanupPatternsYaml);
      dialog.model = createPreviewAutoBuildCleanupModel(options.state(), modeId, sample);
      renderWorkspace();
      dialog.showModal(modeId);
      logDiscovery();
      options.log(`[编译工具] 打开 ${modeId} 清理方式（模拟）`);
    },
    close: cancel,
  };
}
