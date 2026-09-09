import * as PnwCodeCoreUiImport from "@phoenix-wing/code-core/ui";
import { KTC_RUN_CLEANUP_DIALOG_MODES, type KtcCleanupDialogHostAction, type KtcCleanupDialogModel } from "../../src/core/cleanupContracts.js";
import { KtcCreateRunModel } from "../../src/core/run/KtcRunModel.js";
import type { KtcRunPrimaryActionDetail, KtcRunPrimaryPanel } from "../../src/tools/run/KtcRunPrimaryPanel.js";
import "../../src/tools/run/KtcRunPrimaryPanelEntry.js";

interface PreviewCleanupDialog extends HTMLElement {
  model: KtcCleanupDialogModel;
  showModal(modeId?: string): void;
  close(): void;
}

const DIRECT_CLEANUP_BY_ACTION: Readonly<Record<string, string>> = {
  cleanBuild: "build", cleanObjects: "objects", cleanObj: "*.obj",
};

/** Preview-only data, never a filesystem request or a production cleanup policy. */
export function createPreviewRunCleanupModel(directory: string, modeId: string): KtcCleanupDialogModel {
  return {
    title: "Run 清理",
    description: "效果预览：所有条目均为内存样例，不读取或删除真实文件。预览后点击清理。",
    modes: KTC_RUN_CLEANUP_DIALOG_MODES,
    selectedModeId: modeId,
    targets: [{ id: "workspace", label: "当前工作目录", path: directory, selected: true,
      supportedModeIds: KTC_RUN_CLEANUP_DIALOG_MODES.map(({ id }) => id) }],
    rulesVisible: false, rulesLabel: "规则", rulesYaml: "",
    preview: { state: "idle", message: "预览后点击清理。", items: [] },
    previewEnabled: true, executeEnabled: false,
    previewLabel: "预览", executeLabel: "清理", cancelLabel: "取消",
    requireHighRiskConfirmation: false, highRiskConfirmationLabel: "",
  };
}

/** The real shared Run panel and Wing dialog, with an explicitly in-memory Preview Host. */
export function createPreviewRunSurface(options: {
  readonly directory: () => string;
  readonly log: (line: string) => void;
}): { createPrimary(): HTMLElement; directoryChanged(): void } {
  let dialog: PreviewCleanupDialog | undefined;
  let frozenDirectory: string | undefined;
  let sequence = 0;

  const open = (modeId: string): void => {
    if (!dialog) {
      (PnwCodeCoreUiImport as unknown as { pnwCodeDefineCleanupDialog(): void }).pnwCodeDefineCleanupDialog();
      dialog = document.createElement("pnw-cleanup-dialog") as PreviewCleanupDialog;
      dialog.id = "preview-run-cleanup-dialog";
      dialog.addEventListener("pnw-cleanup-dialog-action", (event) => {
        const detail = (event as CustomEvent<KtcCleanupDialogHostAction>).detail;
        if (!dialog || !detail) return;
        if (detail.kind === "cancel") {
          frozenDirectory = undefined;
          options.log("[Run][清理] 已取消（模拟）；未删除真实文件");
          return;
        }
        if (detail.kind !== "preview" && detail.kind !== "execute") return;
        if (frozenDirectory !== options.directory()) {
          dialog.close();
          options.log("[Run][清理] 目录已变化，旧预览已取消（模拟）");
          return;
        }
        if (detail.kind === "preview") {
          const mode = detail.request.modeId;
          const items = mode === "git-untracked"
            ? [`${frozenDirectory}/untracked.tmp（样例）`, `${frozenDirectory}/ignored/artifact.obj（样例）`]
            : [`${frozenDirectory}/${mode === "obj" ? "module.obj" : mode}（样例）`];
          dialog.model = { ...dialog.model, selectedModeId: mode, executeEnabled: true,
            preview: { state: "ready", token: `preview-run:${++sequence}`, summary: `${items.length} 个样例项`,
              message: "仅演示冻结清单；不涉及真实工作区。", items } };
          options.log(`[Run][清理] ${mode} 预览 ${items.length} 项（模拟）`);
        } else if (dialog.model.preview.state === "ready" && detail.previewToken === dialog.model.preview.token) {
          dialog.model = { ...dialog.model, executeEnabled: false,
            preview: { state: "complete", summary: "模拟完成", message: "没有执行文件删除或 Git 命令。",
              items: dialog.model.preview.items } };
          options.log("[Run][清理] 已模拟执行；未删除真实文件，未运行 reset/clean");
        }
      });
      document.body.append(dialog);
    }
    frozenDirectory = options.directory();
    dialog.model = createPreviewRunCleanupModel(frozenDirectory, modeId);
    dialog.showModal(modeId);
    options.log(`[Run][清理] 打开 ${modeId} 方式（模拟）；预览后点击清理`);
  };

  return {
    createPrimary(): HTMLElement {
      const panel = document.createElement("ktc-run-primary-panel") as KtcRunPrimaryPanel;
      panel.model = { ...KtcCreateRunModel({ platform: "darwin", trusted: true, projects: [] }),
        statusText: "Run 清理交互样例 · 不发现或执行真实运行目标。" };
      panel.addEventListener("ktc-run-primary-action", (event) => {
        const { action } = (event as CustomEvent<KtcRunPrimaryActionDetail>).detail;
        const directCleanup = DIRECT_CLEANUP_BY_ACTION[action];
        if (action === "openCleanup") open("git-untracked");
        else if (directCleanup) options.log(`[Run][清理] 直接删除 ${directCleanup}（模拟）；不弹出确认，未删除真实文件`);
        else options.log(`[Run] ${action}（模拟）`);
      });
      return panel;
    },
    directoryChanged(): void {
      if (!dialog || !frozenDirectory || frozenDirectory === options.directory()) return;
      dialog.close();
      frozenDirectory = undefined;
      options.log("[Run][清理] 切换目录，已关闭旧清理预览（模拟）");
    },
  };
}
