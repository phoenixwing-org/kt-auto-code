// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcCleanupDialogModel } from "../../core/cleanupContracts.js";
import type { KtcEditorPrimaryCompanionSnapshot } from "../../core/editorPrimaryCompanionContracts.js";

// Wing owns actual dialog layout/risk gates (covered in its package + local DOM
// suite). This deliberate Host-neutral stand-in detects accidental model resets.
vi.mock("@phoenix-wing/code-core/ui", () => ({ pnwCodeDefineCleanupDialog() {
  if (customElements.get("pnw-cleanup-dialog")) return;
  customElements.define("pnw-cleanup-dialog", class extends HTMLElement {
    private current!: KtcCleanupDialogModel;
    open = false; assignments = 0;
    constructor() { super(); this.attachShadow({ mode: "open" }); }
    set model(value: KtcCleanupDialogModel) {
      this.current = { ...value, requireHighRiskConfirmation: value.requireHighRiskConfirmation !== false };
      this.assignments++;
      const textarea = document.createElement("textarea"); textarea.value = value.rulesYaml;
      textarea.oninput = () => {
        this.current = { ...this.current, rulesYaml: textarea.value, executeEnabled: false, preview: { state: "idle", items: [] } };
        this.dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail: { kind: "change-rules", rulesYaml: textarea.value } }));
      };
      this.shadowRoot!.replaceChildren(textarea);
    }
    get model() { return this.current; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  });
} }));

import { ktcMountAutoBuildCleanupView } from "./autoBuildCleanupView.js";
import type { KtcCleanupYamlWorkspace } from "../../ui/KtcCleanupYamlWorkspace.js";

interface DialogFixture extends HTMLElement { model: KtcCleanupDialogModel; open: boolean; assignments: number; }
const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).forEach((dispose) => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

function cleanup(patch: Partial<KtcCleanupDialogModel> = {}): KtcCleanupDialogModel {
  return { title: "清理", modes: [
    { id: "rules", label: "规则", risk: "normal", rulesVisible: true },
    { id: "git-force", label: "Git", risk: "high", rulesVisible: false },
  ], selectedModeId: "rules", modePresentation: "radio", actionsPlacement: "header", collapsibleSections: true,
  targets: [{ id: "rules:working", label: "当前目录", path: "/safe/work", selected: true, supportedModeIds: ["rules"] },
    { id: "git:working", label: "当前目录", path: "/safe/work", selected: false, supportedModeIds: ["git-force"] }],
  rulesVisible: true, rulesLabel: "清理规则", rulesYaml: "delete:\n  files:\n    - '*.obj'", preview: { state: "idle", items: [] },
  previewEnabled: true, executeEnabled: false, previewLabel: "预览", executeLabel: "清理", cancelLabel: "取消",
  highRiskConfirmationLabel: "确认丢弃", ...patch };
}
function setup() {
  const header = document.createElement("div"); header.id = "autoBuildHeaderActions";
  const existing = document.createElement("button"); existing.textContent = "运行"; header.append(existing); document.body.append(header);
  const postMessage = vi.fn(); disposers.push(ktcMountAutoBuildCleanupView({ postMessage }).dispose);
  const dialog = document.querySelector<DialogFixture>("#autoBuildCleanupDialog")!;
  const button = document.querySelector<HTMLButtonElement>("#autoBuildCleanup")!;
  const workspace = dialog.querySelector<KtcCleanupYamlWorkspace>("ktc-cleanup-yaml-workspace")!;
  let revision = 0;
  const send = (patch: { contextId?: string; revision?: number; ready?: boolean; enabled?: boolean; busy?: boolean;
    lifecycle?: KtcEditorPrimaryCompanionSnapshot["lifecycle"]; cleanup?: KtcCleanupDialogModel; notice?: string;
    source?: Window; origin?: string; disabledReason?: string } = {}) => {
    const snapshot: KtcEditorPrimaryCompanionSnapshot = {
      panelId: "panel", sessionId: "session", toolId: "autoBuild", revision: patch.revision ?? ++revision,
      lifecycle: patch.lifecycle ?? "active", ready: patch.ready ?? true, status: "idle", message: "", summary: [],
      actions: [{ id: "cleanupDialog", label: "清理", enabled: patch.enabled ?? true, disabledReason: patch.disabledReason }],
      primary: { kind: "autoBuild", model: {
        metrics: [], configuration: { name: "", fullPath: "", dirty: false, statusLabel: "", workingDirectoryMismatch: false, workingDirectoryMismatchMessage: "", recent: [] },
        parallelBuild: false, environmentLabel: "", environment: [], maintenance: { scriptStatus: "", scriptDetail: "" },
        cleanup: patch.cleanup ?? cleanup(), cleanupYaml: { contextId: patch.contextId ?? "document:1", busy: patch.busy ?? false,
          notice: patch.notice, sources: [{ id: "one", revision: 4, path: "/safe/work/cleanup.yaml", root: "/safe/work" }] },
      } },
    };
    window.dispatchEvent(new MessageEvent("message", { data: { type: "autoBuildCleanupState", snapshot }, source: patch.source, origin: patch.origin }));
    return snapshot;
  };
  const action = (detail: unknown) => dialog.dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail }));
  const yamlAction = (detail: unknown) => workspace.dispatchEvent(new CustomEvent("ktc-cleanup-yaml-action", { detail, bubbles: true }));
  const hostAction = (kind: string) => dialog.querySelector<HTMLButtonElement>(`[data-cleanup-yaml-action="${kind}"]`)!.click();
  const payloads = () => postMessage.mock.calls.map(([message]) => message.token.payload);
  const open = () => { send(); button.click(); send(); };
  return { header, button, dialog, workspace, postMessage, send, action, yamlAction, hostAction, payloads, open };
}

describe("AutoBuild Right cleanup adapter", () => {
  it("VS Code 将 parent 隐藏为自身时按 Webview origin 接收 Host 状态，拒绝其他 origin", () => {
    const hostFrame = document.createElement("iframe"); document.body.append(hostFrame);
    const host = hostFrame.contentWindow!;
    vi.spyOn(window, "parent", "get").mockReturnValue(window);
    // happy-dom 15 lacks Window.origin; the actual VS Code Chromium frame has it.
    vi.stubGlobal("origin", "vscode-webview://cleanup-smoke");
    const view = setup();
    view.send({ source: host, origin: "https://foreign.invalid", revision: 99 });
    view.button.click();
    expect(view.dialog.model.preview.message).toContain("尚未就绪");
    view.action({ kind: "cancel" });
    view.send({ source: host, origin: window.origin, revision: 1 });
    view.button.click();
    expect(view.dialog.model.modes).toHaveLength(2);
    expect(view.dialog.model.targets.some(({ path }) => path === "/safe/work")).toBe(true);
    expect(view.payloads()).toEqual([{ kind: "yaml-discover" }]);
  });

  it("接受 VS Code 父窗口转发的就绪状态，仍拒绝无关窗口的伪造状态", () => {
    const parentFrame = document.createElement("iframe");
    const foreignFrame = document.createElement("iframe");
    document.body.append(parentFrame, foreignFrame);
    const host = parentFrame.contentWindow!;
    vi.spyOn(window, "parent", "get").mockReturnValue(host);
    const view = setup();
    view.send({ source: foreignFrame.contentWindow!, revision: 99 });
    view.button.click();
    expect(view.dialog.model.preview.message).toContain("尚未就绪");
    expect(view.payloads()).toEqual([]);
    view.action({ kind: "cancel" });
    view.send({ source: host, revision: 1 });
    expect(view.button.disabled).toBe(false);
    view.button.click();
    expect(view.dialog.open).toBe(true);
    expect(view.payloads()).toEqual([{ kind: "yaml-discover" }]);
    view.send({ source: foreignFrame.contentWindow!, revision: 99, enabled: false });
    expect(view.dialog.model.preview.state).not.toBe("error");
    view.send({ source: host, revision: 2, enabled: false });
    expect(view.dialog.model.previewEnabled).toBe(false);
    expect(view.dialog.model.preview.state).toBe("error");
    expect(view.button.disabled).toBe(false);
  });

  it("Right入口始终可点；点击才打开并探测一次，继续复用Wing和YAML组件", () => {
    const view = setup();
    expect(view.button.disabled).toBe(false); expect(view.dialog.open).toBe(false);
    view.send({ ready: false }); expect(view.button.disabled).toBe(false);
    view.send(); expect(view.button.disabled).toBe(false);
    expect(view.dialog.open).toBe(false); expect(view.postMessage).not.toHaveBeenCalled();
    expect(view.header.lastElementChild).toBe(view.button);
    view.button.click(); view.button.click();
    expect(view.dialog.open).toBe(true);
    expect(view.payloads()).toEqual([{ kind: "yaml-discover" }]);
    expect(view.postMessage.mock.calls[0]![0]).toMatchObject({ type: "autoBuildCleanupAction", contextId: "document:1",
      token: { panelId: "panel", sessionId: "session", toolId: "autoBuild", revision: 2, actionId: "cleanupDialog" } });
    expect(view.dialog.model).toMatchObject({ modePresentation: "radio", actionsPlacement: "header", collapsibleSections: true });
    expect(view.dialog.querySelectorAll('[slot="workspace"]')).toHaveLength(1);
    expect(Array.from(view.dialog.querySelectorAll('[slot="header-actions"]')).map((item) => item.textContent)).toEqual(["探测配置"]);
    expect(view.dialog.querySelector('[slot="rules-actions"]')?.textContent).toBe("在 VS Code 中编辑");
  });

  it("未就绪和构建忙时可打开原因提示，关闭不发送取消构建或清理动作", () => {
    const view = setup();
    view.button.click();
    expect(view.dialog.open).toBe(true);
    expect(view.dialog.model.preview.message).toContain("尚未就绪");
    view.action({ kind: "preview" }); view.action({ kind: "cancel" });
    expect(view.dialog.open).toBe(false); expect(view.payloads()).toEqual([]);
    view.send({ enabled: false, busy: true, disabledReason: "已有任务正在运行。" });
    view.button.click();
    expect(view.dialog.open).toBe(true);
    expect(view.dialog.model.preview.message).toBe("已有任务正在运行。");
    expect(view.dialog.model.previewEnabled).toBe(false);
    expect(view.dialog.model.executeEnabled).toBe(false);
    view.action({ kind: "preview" }); view.hostAction("discover"); view.action({ kind: "cancel" });
    expect(view.dialog.open).toBe(false); expect(view.payloads()).toEqual([]);
  });

  it("没有目录时入口仍可打开并解释，不能执行预览或清理", () => {
    const view = setup(); view.send({ cleanup: cleanup({ targets: [] }) });
    view.button.click(); view.send({ cleanup: cleanup({ targets: [] }) });
    expect(view.dialog.open).toBe(true);
    expect(view.dialog.model.preview.message).toContain("没有可用的清理目录");
    expect(view.dialog.model.targets).toHaveLength(0);
    expect(view.dialog.model.executeEnabled).toBe(false);
    view.action({ kind: "preview" }); view.action({ kind: "execute", previewToken: "fake" });
    expect(view.payloads()).toEqual([{ kind: "yaml-discover" }]);
  });

  it("异步notice不重建textarea，保留本地规则/选区；旧ready结果不能复活", () => {
    const view = setup(); view.open();
    // happy-dom 15's unfocused sibling ShadowRoot getter is broken; browser returns null.
    vi.spyOn(view.workspace.shadowRoot!, "activeElement", "get").mockReturnValue(null);
    const textarea = view.dialog.shadowRoot!.querySelector("textarea")!;
    textarea.focus(); textarea.value += "\n# draft"; textarea.setSelectionRange(2, 6, "backward"); textarea.scrollTop = 15;
    textarea.dispatchEvent(new Event("input"));
    const assignments = view.dialog.assignments;
    view.send({ notice: "发现 1 份；详情见日志。" });
    expect(view.dialog.assignments).toBe(assignments);
    expect(view.dialog.shadowRoot!.querySelector("textarea")).toBe(textarea);
    expect(view.dialog.shadowRoot!.activeElement).toBe(textarea);
    expect([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection, textarea.scrollTop]).toEqual([2, 6, "backward", 15]);
    view.send({ cleanup: cleanup({ preview: { state: "ready", token: "old", items: ["stale"] }, executeEnabled: true }) });
    expect(view.dialog.model.rulesYaml).toBe(textarea.value);
    expect(view.dialog.model.preview.state).toBe("idle"); expect(view.dialog.model.executeEnabled).toBe(false);
    view.action({ kind: "execute", previewToken: "old" });
    expect(view.payloads()).toEqual([{ kind: "yaml-discover" }]);
  });

  it("同context更新保持本地mode/目标，当前预检token才能执行；忙时禁用其他动作但可取消", () => {
    const view = setup(); view.open();
    const changed = cleanup({ selectedModeId: "git-force", targets: cleanup().targets.map((target) => ({ ...target, selected: target.id === "git:working" })) });
    view.dialog.model = changed; view.action({ kind: "change-mode", modeId: "git-force" });
    view.send({ notice: "notice" });
    expect(view.dialog.model.selectedModeId).toBe("git-force");
    expect(view.dialog.model.targets.filter(({ selected }) => selected).map(({ id }) => id)).toEqual(["git:working"]);
    view.action({ kind: "preview" });
    expect(view.payloads().at(-1)).toEqual({ kind: "preview", request: { modeId: "git-force", targetIds: ["git:working"], rulesYaml: changed.rulesYaml } });
    view.hostAction("discover"); expect(view.payloads()).toHaveLength(2);
    view.send({ cleanup: { ...changed, preview: { state: "ready", token: "current", items: ["repo/a"] }, executeEnabled: true } });
    expect(view.dialog.model.executeEnabled).toBe(true);
    view.action({ kind: "execute", previewToken: "forged" }); expect(view.payloads()).toHaveLength(2);
    view.action({ kind: "execute", previewToken: "current" }); expect(view.payloads().at(-1)?.kind).toBe("execute");
    view.send({ enabled: false, busy: true });
    view.action({ kind: "cancel" });
    expect(view.payloads().at(-1)).toEqual({ kind: "cancel" }); expect(view.dialog.open).toBe(false);
  });

  it("YAML按钮发送准确草稿或source ID/revision，不携带显示路径，拒绝失效来源", () => {
    const view = setup(); view.open();
    view.dialog.model = { ...view.dialog.model, rulesYaml: "# exact\r\n" };
    view.hostAction("edit-rules");
    expect(view.payloads().at(-1)).toEqual({ kind: "yaml-edit-rules", rulesYaml: "# exact\r\n" });
    view.send(); view.yamlAction({ kind: "open-source", sourceId: "one", path: "/forged" });
    expect(view.payloads().at(-1)).toEqual({ kind: "yaml-open-source", sourceId: "one" });
    view.send(); const count = view.payloads().length;
    view.yamlAction({ kind: "clean-source", sourceId: "one", revision: 3 });
    view.yamlAction({ kind: "clean-source", sourceId: "outside", revision: 4 });
    expect(view.payloads()).toHaveLength(count);
    view.yamlAction({ kind: "clean-source", sourceId: "one", revision: 4, root: "/forged" });
    expect(view.payloads().at(-1)).toEqual({ kind: "yaml-clean-source", sourceId: "one", revision: 4 });
  });

  it.each([["rules", "rules:working"], ["git-force", "git:working"], ["cmake", "cmake:shared"]])(
    "%s 覆盖 Wing 的默认全选，ROOT/thirdParty 不随 radio 自动勾选", (mode, id) => {
      const view = setup(); view.open();
      view.dialog.model = { ...view.dialog.model,
        modes: [...view.dialog.model.modes, { id: "cmake", label: "CMake", risk: "normal", rulesVisible: false }],
        targets: [
          ...cleanup().targets,
          { id: "cmake:shared", label: "build", path: "/safe/work/build", supportedModeIds: ["cmake"], selected: true },
          ...["root", "third-party"].map((name) => ({ id: `${mode}:${name}`, label: name,
            path: `/other/${name}`, supportedModeIds: [mode], selected: true })),
        ].map((target) => ({ ...target, selected: true })),
      };
      view.action({ kind: "change-mode", modeId: mode });
      expect(view.dialog.model.targets.filter(({ selected }) => selected).map(({ id }) => id)).toEqual([id]);
      expect(view.dialog.model.executeEnabled).toBe(false);
    });

  it("旧revision被忽略，context变化关闭但不自动重开，旧context迟到也不能认领", () => {
    const view = setup(); view.open();
    view.send({ revision: 1, enabled: false }); expect(view.button.disabled).toBe(false);
    view.send({ contextId: "document:2" }); expect(view.dialog.open).toBe(false);
    const count = view.payloads().length;
    view.action({ kind: "preview" }); expect(view.payloads()).toHaveLength(count);
    view.send({ revision: 99, contextId: "document:1" }); expect(view.dialog.open).toBe(false);
    view.button.click(); expect(view.dialog.open).toBe(true);
    expect(view.postMessage.mock.calls.at(-1)![0].contextId).toBe("document:2");
    view.send({ contextId: "document:2", lifecycle: "disposed" });
    expect(view.dialog.open).toBe(false); expect(view.button.disabled).toBe(false);
    view.button.click();
    expect(view.dialog.model.preview.message).toContain("已关闭");
  });

  it("取消及Right pagehide后迟到snapshot不打开或发送动作；只导入浏览器依赖", () => {
    const view = setup(); view.open(); view.action({ kind: "cancel" });
    view.send(); expect(view.dialog.open).toBe(false);
    window.dispatchEvent(new Event("pagehide"));
    view.send(); view.button.click();
    expect(document.querySelector("#autoBuildCleanupDialog")).toBeNull();
    expect(view.payloads()).toEqual([{ kind: "yaml-discover" }, { kind: "cancel" }]);
    const source = readFileSync("src/tools/codeAssistant/autoBuildCleanupView.ts", "utf8");
    expect(source).not.toMatch(/from ["'](?:node:|vscode|@phoenix-wing\/run-node)/u);
    expect(source).not.toContain("acquireVsCodeApi");
  });
});
