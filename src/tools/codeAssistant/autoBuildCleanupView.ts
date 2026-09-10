import * as PnwCodeCoreUiImport from "@phoenix-wing/code-core/ui";
import type { KtcCleanupDialogModel, KtcCleanupDialogRequest } from "../../core/cleanupContracts.js";
import type { KtcEditorPrimaryCompanionActionToken, KtcEditorPrimaryCompanionSnapshot } from "../../core/editorPrimaryCompanionContracts.js";
import { KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH } from "../../core/rootCleanupPatterns.js";
import { ktcDefineCleanupYamlWorkspace, type KtcCleanupYamlWorkspace, type KtcCleanupYamlAction } from "../../ui/KtcCleanupYamlWorkspace.js";
import type { KtcAutoBuildCleanupDialogPayload } from "./autoBuildCleanupDialogContracts.js";

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
  button.setAttribute("aria-haspopup", "dialog"); button.disabled = true;
  header.append(button);
  const dialog = document.createElement("pnw-cleanup-dialog") as CleanupDialog;
  dialog.id = "autoBuildCleanupDialog";
  const workspace = document.createElement("ktc-cleanup-yaml-workspace") as KtcCleanupYamlWorkspace;
  workspace.slot = "workspace"; dialog.append(workspace);
  const hostButtons = new Map<string, HTMLButtonElement>();
  for (const [kind, label] of [["edit-rules", "在 VS Code 中编辑"], ["discover", "探测配置"]] as const) {
    const action = document.createElement("button");
    action.type = "button"; action.slot = "header-actions"; action.textContent = label;
    action.dataset.cleanupYamlAction = kind;
    action.style.cssText = "font:inherit;min-height:26px;padding:3px 8px;cursor:pointer;border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)";
    action.onclick = () => handleYaml({ kind });
    hostButtons.set(kind, action); dialog.append(action);
  }
  document.body.append(dialog);
  let current: CleanupSnapshot | undefined;
  let openedContext: string | undefined;
  let active = false;
  let disposed = false;
  let awaitingHost = false;
  let previewRequest: string | undefined;
  let resultKind: "preview" | "execute" | "yaml-clean-source" | undefined;
  const revisions = new Map<string, number>();
  const retiredContexts = new Set<string>();
  const sessionKey = (snapshot: CleanupSnapshot) => JSON.stringify([snapshot.panelId, snapshot.sessionId]);
  const contextKey = (snapshot: CleanupSnapshot) => JSON.stringify([sessionKey(snapshot), snapshot.primary.model.cleanupYaml!.contextId]);
  const enabled = () => !!current?.ready && current.lifecycle !== "disposed"
    && current.actions.some((action) => action.id === "cleanupDialog" && action.enabled);
  const busy = () => awaitingHost || !enabled() || current?.primary.model.cleanupYaml?.busy === true;
  const request = (): KtcCleanupDialogRequest => ({
    modeId: dialog.model.selectedModeId ?? "",
    targetIds: dialog.model.targets.filter((target) => target.selected && !target.disabled
      && (!target.supportedModeIds?.length || target.supportedModeIds.includes(dialog.model.selectedModeId ?? ""))).map(({ id }) => id),
    rulesYaml: dialog.model.rulesYaml,
  });
  const requestKey = (value: KtcCleanupDialogRequest) => JSON.stringify([value.modeId, [...value.targetIds].sort(), value.rulesYaml]);
  const close = () => { active = false; openedContext = undefined; awaitingHost = false; previewRequest = undefined; resultKind = undefined; dialog.close(); };
  const renderWorkspace = (notice?: string) => {
    if (!current) return;
    const model = current.primary.model.cleanupYaml!;
    // The workspace owns only summary/source rows; verbose diagnostics stay in Output.
    workspace.model = { ...model, busy: busy(), ...(notice !== undefined ? { notice } : {}) };
    hostButtons.forEach((item) => { item.disabled = busy(); });
  };
  const render = () => {
    button.disabled = !enabled();
    button.title = button.disabled ? current?.actions.find(({ id }) => id === "cleanupDialog")?.disabledReason ?? "等待编译工具就绪" : "打开清理";
    if (!active || !current || openedContext !== contextKey(current)) return;
    const host = current.primary.model.cleanup;
    const local = dialog.model;
    const selected = new Map(local.targets.map(({ id, selected }) => [id, selected]));
    const targets = host.targets.map((target) => ({ ...target, selected: selected.get(target.id) ?? false }));
    const matchesRequest = previewRequest === requestKey(request());
    const resultAllowed = resultKind === "yaml-clean-source" || (!!resultKind && matchesRequest);
    const preview: KtcCleanupDialogModel["preview"] = busy()
      ? { state: host.preview.state === "executing" ? "executing" : "loading", message: "正在处理清理请求…", items: [] }
      : resultAllowed ? host.preview : { state: "idle", items: [] };
    const next: KtcCleanupDialogModel = { ...host, selectedModeId: local.selectedModeId, rulesYaml: local.rulesYaml, targets,
      modePresentation: "radio", collapsibleSections: true, actionsPlacement: "header",
      requireHighRiskConfirmation: host.requireHighRiskConfirmation !== false,
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
    if (payload.kind !== "cancel") awaitingHost = true;
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
    const action = (event as CustomEvent<{ kind?: string; previewToken?: string }>).detail;
    if (!active || !action) return;
    if (action.kind === "cancel") { send({ kind: "cancel" }); return; }
    if (busy()) return;
    if (["change-mode", "change-rules", "toggle-target"].includes(action.kind ?? "")) {
      previewRequest = undefined; resultKind = undefined;
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
    if (!current || !enabled() || active || disposed) return;
    openedContext = contextKey(current); active = true; awaitingHost = false; previewRequest = undefined; resultKind = undefined;
    dialog.model = { ...current.primary.model.cleanup, modePresentation: "radio", collapsibleSections: true, actionsPlacement: "header",
      preview: { state: "idle", items: [] }, executeEnabled: false };
    render(); dialog.showModal(); send({ kind: "yaml-discover" });
  };
  const receive = (event: MessageEvent) => {
    if (disposed || (event.source && event.source !== window) || event.data?.type !== "autoBuildCleanupState") return;
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
    dialog.remove(); button.remove();
  };
  window.addEventListener("pagehide", dispose);
  return { dispose };
}
