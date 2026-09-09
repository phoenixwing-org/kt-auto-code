import * as PnwCodeCoreUiImport from "@phoenix-wing/code-core/ui";
import type { KtcCleanupDialogHostAction, KtcCleanupDialogModel, KtcCleanupDialogRequest } from "../../src/core/cleanupContracts.js";
import { KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH } from "../../src/core/rootCleanupPatterns.js";
import { PREVIEW_AUTO_BUILD_SAMPLE, type PreviewAutoBuildSample } from "./previewAutoBuildSample.js";
import type { PreviewAutoBuildState } from "./previewAutoBuildState.js";

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
    description: "效果预览：目标和清单均为内存样例，不读取或删除真实文件。先预览，再确认执行所选方式。",
    modes: [
      { id: "rules", label: "规则产物", description: "按 YAML 规则清理 ROOT 或工作目录的直属构建产物（模拟）。", risk: "normal", rulesVisible: true },
      { id: "git-force", label: "Git 强制恢复", description: "reset --hard HEAD + clean -ffdx；真实操作会丢弃未提交、未跟踪及忽略内容。此处仅模拟。", risk: "high", rulesVisible: false },
      { id: "cmake", label: "CMake 产物", description: "项目 build 目录产物清理（模拟）。", risk: "normal", rulesVisible: false },
    ],
    selectedModeId: modeId,
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
}): { open(modeId?: PreviewAutoBuildCleanupMode): void; close(): void } {
  let dialog: PreviewAutoBuildCleanupDialog | undefined;
  let sequence = 0;
  let active = false;
  let openedContext = "";
  let frozen: { token: string; request: string; context: string } | undefined;
  const context = () => JSON.stringify([options.state().cleanupPatternsYaml, options.state().rootEnabled, options.state().thirdPartyEnabled]);
  const requestKey = (request: KtcCleanupDialogRequest) => JSON.stringify([request.modeId, [...request.targetIds].sort(), request.rulesYaml]);
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
    if (detail.kind === "change-rules") {
      frozen = undefined;
      options.updateRules(detail.rulesYaml.slice(0, KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH));
      openedContext = context();
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
        document.body.append(dialog);
      }
      active = true;
      frozen = undefined;
      openedContext = context();
      dialog.model = createPreviewAutoBuildCleanupModel(options.state(), modeId, options.sample);
      dialog.showModal(modeId);
      options.log(`[编译工具] 打开 ${modeId} 清理方式（模拟）`);
    },
    close: cancel,
  };
}
