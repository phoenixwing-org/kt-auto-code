import * as PnwCodeCoreUiImport from "@phoenix-wing/code-core/ui";
import type { KtcCleanupDialogModel, KtcCleanupDialogRequest } from "../../core/cleanupContracts.js";
import type { KtcEditorPrimaryCompanionActionToken, KtcEditorPrimaryCompanionSnapshot } from "../../core/editorPrimaryCompanionContracts.js";
import { KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH } from "../../core/rootCleanupPatterns.js";
import { ktcDefineCleanupYamlWorkspace, type KtcCleanupYamlWorkspace, type KtcCleanupYamlAction } from "../../ui/KtcCleanupYamlWorkspace.js";
import type { KtcAutoBuildCleanupDialogPayload } from "./autoBuildCleanupDialogContracts.js";
import { ktcSelectCurrentDirectoryCleanupTargets } from "../../core/autoBuildCleanupScope.js";
import { ktcMountCleanupDialogLayout } from "../../ui/ktcCleanupDialogLayout.js";

interface CleanupDialog extends HTMLElement {
  model: KtcCleanupDialogModel;
  showModal(): void;
  close(): void;
}
type CleanupSnapshot = KtcEditorPrimaryCompanionSnapshot & {
  primary: Extract<NonNullable<KtcEditorPrimaryCompanionSnapshot["primary"]>, { kind: "autoBuild" }>;
};

/** Browser-only Right adapter. All file access and cleanup remain behind Host tokens. */
export function ktcMountAutoBuildCleanupView(options: { postMessage(message: unknown): void }): { dispose(): void } {
  const header = document.getElementById("autoBuildHeaderActions");
  if (!header) return { dispose() {} };
  (PnwCodeCoreUiImport as unknown as { pnwCodeDefineCleanupDialog(): void }).pnwCodeDefineCleanupDialog();
  ktcDefineCleanupYamlWorkspace();
  const button = document.createElement("button");
  button.id = "autoBuildCleanup"; button.type = "button"; button.textContent = "清理";
  button.setAttribute("aria-haspopup", "dialog"); button.title = "打开清理";
  header.append(button);
  const dialog = document.createElement("pnw-cleanup-dialog") as CleanupDialog;
  dialog.id = "autoBuildCleanupDialog";
  const workspace = document.createElement("ktc-cleanup-yaml-workspace") as KtcCleanupYamlWorkspace;
  workspace.slot = "workspace"; dialog.append(workspace);
  const hostButtons = new Map<string, HTMLButtonElement>();
  for (const [kind, label] of [["edit-rules", "在 VS Code 中编辑"], ["discover", "探测配置"]] as const) {
    const action = document.createElement("button");
    action.type = "button"; action.slot = kind === "edit-rules" ? "rules-actions" : "header-actions"; action.textContent = label;
    action.dataset.cleanupYamlAction = kind;
    action.style.cssText = "font:inherit;min-height:26px;padding:3px 8px;cursor:pointer;border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)";
    action.onclick = () => handleYaml({ kind });
    hostButtons.set(kind, action); dialog.append(action);
  }
  document.body.append(dialog);
  const disposeLayout = ktcMountCleanupDialogLayout(dialog);
  let current: CleanupSnapshot | undefined;
  let openedContext: string | undefined;
  let active = false;
  let disposed = false;
  let awaitingHost = false;
  let hostRequestSent = false;
  let previewRequest: string | undefined;
  let resultKind: "preview" | "execute" | "yaml-clean-source" | undefined;
  const revisions = new Map<string, number>();
  const retiredContexts = new Set<string>();
  const sessionKey = (snapshot: CleanupSnapshot) => JSON.stringify([snapshot.panelId, snapshot.sessionId]);
  const contextKey = (snapshot: CleanupSnapshot) => JSON.stringify([sessionKey(snapshot), snapshot.primary.model.cleanupYaml!.contextId]);
  const enabled = () => !!current?.ready && current.lifecycle !== "disposed"
    && current.actions.some((action) => action.id === "cleanupDialog" && action.enabled);
  const unavailableReason = () => current?.actions.find(({ id }) => id === "cleanupDialog")?.disabledReason
    ?? (current?.lifecycle === "disposed" ? "编译工具已关闭，请重新打开。"
      : !current?.ready ? "编译工具尚未就绪，请稍后重试。" : "当前操作尚未结束，请稍后重试。");
  const busy = () => awaitingHost || !enabled() || current?.primary.model.cleanupYaml?.busy === true;
  const request = (): KtcCleanupDialogRequest => ({
    modeId: dialog.model.selectedModeId ?? "",
    targetIds: dialog.model.targets.filter((target) => target.selected && !target.disabled
      && (!target.supportedModeIds?.length || target.supportedModeIds.includes(dialog.model.selectedModeId ?? ""))).map(({ id }) => id),
    rulesYaml: dialog.model.rulesYaml,
  });
  const requestKey = (value: KtcCleanupDialogRequest) => JSON.stringify([value.modeId, [...value.targetIds].sort(), value.rulesYaml]);
  const close = () => { active = false; openedContext = undefined; awaitingHost = false; hostRequestSent = false; previewRequest = undefined; resultKind = undefined; dialog.close(); };
  const renderWorkspace = (notice?: string) => {
    if (!current) return;
    const model = current.primary.model.cleanupYaml!;
    // The workspace owns only summary/source rows; verbose diagnostics stay in Output.
    workspace.model = { ...model, busy: busy(), ...(notice !== undefined ? { notice } : {}) };
    hostButtons.forEach((item) => { item.disabled = busy(); });
  };
  const render = () => {
    if (!active || !current || openedContext !== contextKey(current)) return;
    const host = current.primary.model.cleanup;
    const local = dialog.model;
    const selected = new Map(local.targets.map(({ id, selected }) => [id, selected]));
    const targets = host.targets.map((target) => ({ ...target, selected: selected.get(target.id) ?? false }));
    const matchesRequest = previewRequest === requestKey(request());
    const resultAllowed = resultKind === "yaml-clean-source" || (!!resultKind && matchesRequest);
    const hasTargets = targets.some((target) => !target.disabled
      && (!target.supportedModeIds?.length || target.supportedModeIds.includes(local.selectedModeId ?? "")));
    const preview: KtcCleanupDialogModel["preview"] = !enabled() && !awaitingHost
      ? { state: "error", message: unavailableReason(), items: [] }
      : busy()
      ? { state: host.preview.state === "executing" ? "executing" : "loading", message: "正在处理清理请求…", items: [] }
      : resultAllowed ? host.preview : { state: "idle", items: [],
        ...(!hasTargets ? { message: "当前方式没有可用的清理目录，请先选择目录或切换清理方式。" } : {}) };
    const next: KtcCleanupDialogModel = { ...host, selectedModeId: local.selectedModeId, rulesYaml: local.rulesYaml, targets,
      modePresentation: "radio", collapsibleSections: true, actionsPlacement: "header",
      requireHighRiskConfirmation: host.requireHighRiskConfirmation !== false,
      // Wing re-checks mode/target selection locally on each radio change.
      // Keep this Host permission separate so an initially empty mode cannot
      // leave a later valid mode permanently disabled.
      preview, previewEnabled: enabled() && !busy(), executeEnabled: !busy() && resultAllowed && host.executeEnabled,
      executeLabel: local.selectedModeId === "git-force" ? "强制清理" : "清理" };
    // Notice/revision-only snapshots must not rebuild Wing's active textarea/caret.
    if (JSON.stringify(next) !== JSON.stringify(local)) dialog.model = next;
    renderWorkspace();
  };
  const send = (payload: KtcAutoBuildCleanupDialogPayload): boolean => {
    if (!active || disposed || !current || openedContext !== contextKey(current)) return false;
    if (payload.kind !== "cancel" && busy()) return false;
    const token: KtcEditorPrimaryCompanionActionToken = {
      panelId: current.panelId, toolId: "autoBuild", sessionId: current.sessionId,
      revision: current.revision, actionId: "cleanupDialog", payload,
    };
    if (payload.kind !== "cancel") { awaitingHost = true; hostRequestSent = true; }
    options.postMessage({ type: "autoBuildCleanupAction", contextId: current.primary.model.cleanupYaml!.contextId, token });
    if (payload.kind === "cancel") close(); else render();
    return true;
  };
  function handleYaml(action: KtcCleanupYamlAction): void {
    if (!active || busy()) return;
    if (action.kind === "edit-rules") {
      if (dialog.model.rulesYaml.length > KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH) {
        renderWorkspace(`规则不能超过 ${KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH} 个字符。`); return;
      }
      send({ kind: "yaml-edit-rules", rulesYaml: dialog.model.rulesYaml });
    } else if (action.kind === "discover") send({ kind: "yaml-discover" });
    else if (action.kind === "open-source" || action.kind === "clean-source") {
      const source = workspace.model.sources.find(({ id }) => id === action.sourceId);
      if (!source) return;
      if (action.kind === "open-source") send({ kind: "yaml-open-source", sourceId: source.id });
      else if (action.kind === "clean-source" && source.revision === action.revision && !source.disabledReason) {
        resultKind = "yaml-clean-source"; previewRequest = undefined;
        send({ kind: "yaml-clean-source", sourceId: source.id, revision: source.revision });
      }
    }
  }
  const onYaml = (event: Event) => { const detail = (event as CustomEvent<KtcCleanupYamlAction>).detail; if (detail) handleYaml(detail); };
  const onAction = (event: Event) => {
    const action = (event as CustomEvent<{ kind?: string; modeId?: string; previewToken?: string }>).detail;
    if (!action) return;
    if (action.kind === "cancel") {
      // Opening a read-only explanation during a build must not cancel that build.
      if (active && hostRequestSent) send({ kind: "cancel" }); else close();
      return;
    }
    if (!active) return;
    if (busy()) return;
    if (["change-mode", "change-rules", "toggle-target"].includes(action.kind ?? "")) {
      previewRequest = undefined; resultKind = undefined;
      if (action.kind === "change-mode" && action.modeId && dialog.model.modes.some(({ id }) => id === action.modeId)) {
        // Wing's generic radio handler selects all matching targets. This consumer
        // deliberately narrows each new mode to the current directory instead.
        dialog.model = { ...dialog.model, selectedModeId: action.modeId,
          targets: ktcSelectCurrentDirectoryCleanupTargets(dialog.model.targets, action.modeId),
          preview: { state: "idle", items: [] }, executeEnabled: false };
      }
      // Wing already invalidates its preview in-place and preserves input focus.
      return;
    }
    const value = request();
    if (!value.modeId || !value.targetIds.length || value.rulesYaml.length > KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH) return;
    if (action.kind === "preview") {
      previewRequest = requestKey(value); resultKind = "preview";
      send({ kind: "preview", request: { ...value, modeId: value.modeId as "rules" | "git-force" | "cmake" } });
    } else if (action.kind === "execute" && dialog.model.executeEnabled && dialog.model.preview.state === "ready"
      && action.previewToken && action.previewToken === dialog.model.preview.token && previewRequest === requestKey(value)) {
      resultKind = "execute";
      send({ kind: "execute", request: { ...value, modeId: value.modeId as "rules" | "git-force" | "cmake" }, previewToken: action.previewToken });
    }
  };
  dialog.addEventListener("pnw-cleanup-dialog-action", onAction);
  dialog.addEventListener("ktc-cleanup-yaml-action", onYaml);
  button.onclick = () => {
    if (active || disposed) return;
    if (!current || current.lifecycle === "disposed") {
      const reason = unavailableReason();
      dialog.model = { title: "清理", modes: [], targets: [], rulesVisible: false, rulesLabel: "清理规则", rulesYaml: "",
        actionsPlacement: "header", collapsibleSections: true, preview: { state: "error", message: reason, items: [] },
        previewEnabled: false, executeEnabled: false, previewLabel: "预览", executeLabel: "清理", cancelLabel: "取消",
        previewDisabledReason: reason, executeDisabledReason: reason, highRiskConfirmationLabel: "确认清理" };
      workspace.model = { sources: [], busy: true };
      hostButtons.forEach((item) => { item.disabled = true; });
      dialog.showModal();
      return;
    }
    openedContext = contextKey(current); active = true; awaitingHost = false; previewRequest = undefined; resultKind = undefined;
    dialog.model = { ...current.primary.model.cleanup, modePresentation: "radio", collapsibleSections: true, actionsPlacement: "header",
      preview: { state: "idle", items: [] }, executeEnabled: false };
    render(); dialog.showModal();
    if (!busy()) send({ kind: "yaml-discover" });
  };
  const receive = (event: MessageEvent) => {
    // VS Code forwards Host IPC from its same-origin outer Webview, but masks
    // window.parent = window before our scripts run. Comparing source to parent
    // alone therefore drops every real Host message. Accept the non-opaque
    // Webview origin, keeping foreign origins out and Host action tokens intact.
    const fromWebviewHost = !!event.origin && event.origin !== "null" && event.origin === window.origin;
    if (disposed || ((event.source && event.source !== window && event.source !== window.parent)
      && !fromWebviewHost) || event.data?.type !== "autoBuildCleanupState") return;
    const value = event.data.snapshot as CleanupSnapshot | undefined;
    if (!value || value.toolId !== "autoBuild" || value.primary?.kind !== "autoBuild"
      || !value.panelId || !value.sessionId || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !Array.isArray(value.actions) || !value.primary.model?.cleanup || !value.primary.model.cleanupYaml?.contextId) return;
    const session = sessionKey(value), context = contextKey(value);
    if (value.revision <= (revisions.get(session) ?? -1) || retiredContexts.has(context)) return;
    revisions.set(session, value.revision);
    if (current && context !== contextKey(current)) { retiredContexts.add(contextKey(current)); close(); }
    current = value; awaitingHost = false;
    if (value.lifecycle === "disposed") { retiredContexts.add(context); close(); }
    render();
  };
  window.addEventListener("message", receive);
  const dispose = () => {
    if (disposed) return;
    disposed = true; close(); window.removeEventListener("message", receive); window.removeEventListener("pagehide", dispose);
    dialog.removeEventListener("pnw-cleanup-dialog-action", onAction); dialog.removeEventListener("ktc-cleanup-yaml-action", onYaml);
    disposeLayout(); dialog.remove(); button.remove();
  };
  window.addEventListener("pagehide", dispose);
  return { dispose };
}
