// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcCleanupDialogModel, KtcCleanupDialogRequest } from "../core/cleanupContracts.js";

// Only the browser-to-Preview Host adapter is under test here. Wing owns and tests
// the real modal DOM, high-risk checkbox, and token/UI-edit invalidation behavior.
vi.mock("@phoenix-wing/code-core/ui", () => ({
  pnwCodeDefineCleanupDialog() {
    if (customElements.get("pnw-cleanup-dialog")) return;
    customElements.define("pnw-cleanup-dialog", class extends HTMLElement {
      model!: KtcCleanupDialogModel;
      open = false;
      openedMode = "";
      showModal(modeId?: string) { this.open = true; this.openedMode = modeId ?? ""; }
      close() { this.open = false; }
    });
  },
}));

import { createPreviewAutoBuildCleanupModel, createPreviewAutoBuildCleanupSurface } from "../../ui-preview/src/previewAutoBuildCleanup.js";
import { createDefaultPreviewAutoBuildState, type PreviewAutoBuildState } from "../../ui-preview/src/previewAutoBuildState.js";
import type { PreviewCleanupYamlDiscoveryLimits } from "../../ui-preview/src/previewCleanupYamlWorkspace.js";

interface DialogFixture extends HTMLElement { model: KtcCleanupDialogModel; open: boolean; openedMode: string; }
afterEach(() => document.body.replaceChildren());

function setup(discoveryLimits?: PreviewCleanupYamlDiscoveryLimits) {
  let state = createDefaultPreviewAutoBuildState();
  const log = vi.fn<(line: string) => void>();
  const execute = vi.fn();
  const updateRules = vi.fn((value: string) => { state = { ...state, cleanupPatternsYaml: value }; });
  const surface = createPreviewAutoBuildCleanupSurface({ state: () => state, log, execute, updateRules, discoveryLimits });
  const dialog = () => document.querySelector<DialogFixture>("#preview-auto-build-cleanup-dialog")!;
  const send = (detail: unknown) => dialog().dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail }));
  const request = (): KtcCleanupDialogRequest => ({ modeId: dialog().model.selectedModeId!, rulesYaml: dialog().model.rulesYaml,
    targetIds: dialog().model.targets.filter(({ selected, supportedModeIds }) => selected && supportedModeIds?.includes(dialog().model.selectedModeId!)).map(({ id }) => id) });
  const preview = () => { send({ kind: "preview", request: request() }); return dialog().model.preview.token!; };
  return { surface, log, execute, updateRules, dialog, send, request, preview, state: () => state,
    setState(patch: Partial<PreviewAutoBuildState>) { state = { ...state, ...patch }; } };
}

describe("AutoBuild Preview Wing cleanup Host adapter", () => {
  it("三模式保留 ROOT/工作目录、仓库、CMake 目标及 Git 独有高风险确认", () => {
    const model = createPreviewAutoBuildCleanupModel(createDefaultPreviewAutoBuildState());
    expect(model.modes.map(({ id, risk }) => [id, risk])).toEqual([["rules", "normal"], ["git-force", "high"], ["cmake", "normal"]]);
    expect(model.targets.filter(({ supportedModeIds }) => supportedModeIds?.includes("rules")).map(({ label }) => label)).toEqual(["ROOT_DIR", "工作目录"]);
    expect(model.targets.filter(({ supportedModeIds }) => supportedModeIds?.includes("git-force"))).toHaveLength(4);
    expect(model.targets.filter(({ supportedModeIds }) => supportedModeIds?.includes("cmake")).map(({ path }) => path))
      .toEqual(["/workspace/Phoenix/projects/KtCore/build"]);
    expect(model.requireHighRiskConfirmation).toBe(true);
    expect(model.highRiskConfirmationLabel).toContain("未提交、未跟踪及忽略内容");
    expect(model.description).toContain("不读取或删除真实文件");
    expect(model.executeEnabled).toBe(false);
    expect(model.preview.token).toBeUndefined();
    expect(model).toMatchObject({ modePresentation: "radio", collapsibleSections: true, actionsPlacement: "header" });
  });

  it("复用一个 Wing 元素且支持三种 mode 直达，不新增手写 dialog", () => {
    const view = setup();
    for (const mode of ["rules", "cmake", "git-force"] as const) {
      view.surface.open(mode);
      expect(view.dialog().openedMode).toBe(mode);
      expect(view.dialog().model.selectedModeId).toBe(mode);
      expect(view.dialog().model.executeLabel).toBe(mode === "git-force" ? "强制清理" : "清理");
    }
    expect(document.querySelectorAll("pnw-cleanup-dialog")).toHaveLength(1);
    expect(Array.from(view.dialog().querySelectorAll('[slot="header-actions"]')).map((button) => button.textContent))
      .toEqual(["在 VS Code 中编辑", "探测配置"]);
    expect(view.dialog().querySelectorAll('[slot="workspace"]')).toHaveLength(1);
    expect(document.querySelector("dialog")).toBeNull();
    expect(view.execute).not.toHaveBeenCalled();
  });

  it.each(["rules", "git-force", "cmake"] as const)("%s 先冻结样例再模拟执行，token 一次性使用", (mode) => {
    const view = setup(); view.surface.open(mode);
    const token = view.preview();
    expect(token).toBeTruthy();
    expect(view.dialog().model.preview.message).toContain("不访问文件系统");
    expect(view.dialog().model.preview.items.every((item) => item.includes("样例"))).toBe(true);
    expect(view.execute).not.toHaveBeenCalled();
    view.send({ kind: "execute", request: view.request(), previewToken: token });
    expect(view.execute).toHaveBeenCalledExactlyOnceWith(mode);
    expect(view.dialog().model.preview.state).toBe("complete");
    expect(view.dialog().model.preview.message).toContain("未删除真实文件");
    view.send({ kind: "execute", request: view.request(), previewToken: token });
    expect(view.execute).toHaveBeenCalledTimes(1);
  });

  it("缺少、伪造及取消后的旧预览 token 不执行，取消始终输出模拟日志", () => {
    const view = setup(); view.surface.open();
    view.send({ kind: "execute", request: view.request(), previewToken: "missing" });
    expect(view.execute).not.toHaveBeenCalled();
    const token = view.preview();
    view.send({ kind: "execute", request: view.request(), previewToken: "forged" });
    expect(view.execute).not.toHaveBeenCalled();
    view.send({ kind: "cancel" });
    expect(view.dialog().open).toBe(false);
    expect(view.log).toHaveBeenCalledWith(expect.stringContaining("已取消清理（模拟）"));
    view.send({ kind: "execute", request: view.request(), previewToken: token });
    expect(view.execute).not.toHaveBeenCalled();
    view.surface.open();
    view.send({ kind: "execute", request: view.request(), previewToken: token });
    expect(view.execute).not.toHaveBeenCalled();
  });

  it("规则编辑缓存到原预览状态，清除旧冻结清单并在重开时恢复", () => {
    const view = setup(); view.surface.open();
    const token = view.preview();
    const rulesYaml = "delete:\n  files:\n    - '*.pdb'";
    view.dialog().model = { ...view.dialog().model, rulesYaml, preview: { state: "idle", items: [] } };
    view.send({ kind: "change-rules", rulesYaml });
    expect(view.updateRules).toHaveBeenCalledWith(rulesYaml);
    view.send({ kind: "execute", request: view.request(), previewToken: token });
    expect(view.execute).not.toHaveBeenCalled();
    view.surface.close(); view.surface.open();
    expect(view.dialog().model.rulesYaml).toBe(rulesYaml);
  });

  it.each(["change-mode", "toggle-target"] as const)("%s 使已冻结 token 失效", (kind) => {
    const view = setup(); view.surface.open(); const token = view.preview();
    view.send(kind === "change-mode" ? { kind, modeId: "cmake" } : { kind, targetId: "rules:working", selected: false });
    expect(view.dialog().model.executeEnabled).toBe(false);
    view.send({ kind: "execute", request: view.request(), previewToken: token });
    expect(view.execute).not.toHaveBeenCalled();
  });

  it("拒绝无目标、重复/未知目标及空规则，编译启动或配置变化使清理失效", () => {
    const view = setup(); view.surface.open();
    for (const targetIds of [[], ["unknown"], ["rules:root", "rules:root"]]) {
      view.send({ kind: "preview", request: { ...view.request(), targetIds } });
      expect(view.dialog().model.preview.state).toBe("error");
    }
    view.dialog().model = { ...view.dialog().model, rulesYaml: " " };
    view.send({ kind: "preview", request: view.request() });
    expect(view.dialog().model.preview.message).toContain("填写清理 YAML");
    view.surface.open(); let token = view.preview();
    view.setState({ rootEnabled: false });
    view.send({ kind: "execute", request: view.request(), previewToken: token });
    expect(view.dialog().model.preview.message).toContain("编译配置已变化");
    view.surface.open(); token = view.preview();
    view.setState({ phase: "running" });
    view.send({ kind: "execute", request: view.request(), previewToken: token });
    expect(view.dialog().model.preview.message).toContain("编译运行中");
    expect(view.execute).not.toHaveBeenCalled();
  });

  it("main 接共享工厂并保留仓库清单窗口，不引入 Node/正式清理运行时", () => {
    const main = readFileSync("ui-preview/src/main.ts", "utf8");
    const source = readFileSync("ui-preview/src/previewAutoBuildCleanup.ts", "utf8");
    expect(main).toContain('from "./previewAutoBuildCleanup.js"');
    expect(main).toContain("previewAutoBuildCleanupSurface.open(modeId)");
    expect(main).toContain("previewAutoBuildCleanupSurface.close()");
    expect(main).toContain("preview-manifest-dialog");
    expect(source).not.toMatch(/from ["'](?:node:|vscode|@phoenix-wing\/run-node)/u);
    expect(source).not.toContain('createElement("dialog")');
    expect(source).toContain('createElement("pnw-cleanup-dialog")');
  });

  it("YAML 行直接执行仅影响对应来源，不确认、不复用全局清理回调", () => {
    const view = setup(); view.surface.open();
    const workspace = view.dialog().querySelector("ktc-cleanup-yaml-workspace")!;
    workspace.dispatchEvent(new CustomEvent("ktc-cleanup-yaml-action", { detail: { kind: "clean-source", sourceId: "sample-cleanup", revision: 1 }, bubbles: true }));
    expect(view.execute).not.toHaveBeenCalled();
    expect(view.dialog().model.preview.state).toBe("complete");
    expect(view.dialog().model.preview.items).toEqual(["/workspace/Phoenix/projects/sample/objects（样例）", "/workspace/Phoenix/projects/sample/module.obj（样例）"]);
    workspace.dispatchEvent(new CustomEvent("ktc-cleanup-yaml-action", { detail: { kind: "clean-source", sourceId: "sample-cleanup", revision: 1 }, bubbles: true }));
    expect(view.dialog().model.preview.state).toBe("error");
    view.surface.close();
    workspace.dispatchEvent(new CustomEvent("ktc-cleanup-yaml-action", { detail: { kind: "clean-source", sourceId: "working-cleanup", revision: 1 }, bubbles: true }));
    expect(view.dialog().model.preview.state).toBe("idle");
  });

  it("原生编辑模拟发当前规则，不引入tabs/导入/保存对话框；迟到编辑不能认领新context", () => {
    const view = setup(); view.surface.open();
    const yaml = "delete:\n  files:\n    - '*.obj'";
    view.dialog().model = { ...view.dialog().model, rulesYaml: yaml };
    view.send({ kind: "change-rules", rulesYaml: yaml });
    view.dialog().querySelector<HTMLButtonElement>('[data-cleanup-yaml-action="edit-rules"]')!.click();
    expect(view.log).toHaveBeenCalledWith(expect.stringContaining(`[YAML 草稿（模拟）]\n${yaml}`));
    view.setState({ rootEnabled: false });
    view.send({ kind: "change-rules", rulesYaml: "late" });
    expect(view.updateRules).toHaveBeenCalledTimes(1);
    expect(view.dialog().model.preview.message).toContain("编译配置已变化");
  });

  it("Header探测按钮冒泡到共享adapter，来源列表不重复提供全局操作", () => {
    const view = setup(); view.surface.open();
    const workspace = view.dialog().querySelector("ktc-cleanup-yaml-workspace")!;
    expect(workspace.shadowRoot?.querySelector('[role="toolbar"]')).toBeNull();
    expect(workspace.shadowRoot?.querySelector('[data-focus="discover"], [data-focus="edit-rules"]')).toBeNull();
    const discover = view.dialog().querySelector<HTMLButtonElement>('[data-cleanup-yaml-action="discover"]')!;
    discover.click();
    expect(workspace.shadowRoot?.querySelector(".notice")?.textContent).toContain("探测到 2 份 cleanup.yaml");
    expect(view.log).toHaveBeenCalledWith(expect.stringContaining("仅从当前工作目录向下：/workspace/Phoenix/projects；发现 2 份 cleanup.yaml"));
    expect(view.execute).not.toHaveBeenCalled();
  });

  it.each([{ maxDepth: 0 }, { maxSources: 1 }])("探测 %o 明细进日志，列表仅保留数量与简短不完整状态", (limits) => {
    const view = setup(limits); view.surface.open();
    const workspace = view.dialog().querySelector("ktc-cleanup-yaml-workspace")!;
    view.dialog().querySelector<HTMLButtonElement>('[data-cleanup-yaml-action="discover"]')!.click();
    const notice = workspace.shadowRoot?.querySelector(".notice")?.textContent;
    expect(notice).toBe("探测到 1 份 cleanup.yaml（内存样例） · 不完整，详情见日志");
    expect(notice).not.toMatch(/深度|限额|\/workspace/);
    expect(view.log).toHaveBeenCalledWith(expect.stringMatching(/\[YAML 探测\]\[跳过\/限额\]\[模拟\].*(深度 0|1 份 YAML 来源限额)/));
    workspace.dispatchEvent(new CustomEvent("ktc-cleanup-yaml-action", { detail: { kind: "clean-source", sourceId: "sample-cleanup", revision: 1 }, bubbles: true }));
    expect(view.dialog().model.preview.message).toContain("未找到当前探测中的 YAML");
    expect(view.execute).not.toHaveBeenCalled();
  });

  it("工作目录变化使旧来源失效，重开只使用新工作目录及子目录", () => {
    const view = setup(); view.surface.open();
    const previous = view.state();
    view.setState({ session: { ...previous.session, draft: { ...previous.session.draft,
      configuration: { ...previous.session.draft.configuration, workingDirectory: "/workspace/new-working" } } } });
    const workspace = view.dialog().querySelector("ktc-cleanup-yaml-workspace")!;
    workspace.dispatchEvent(new CustomEvent("ktc-cleanup-yaml-action", { detail: { kind: "clean-source", sourceId: "working-cleanup", revision: 1 }, bubbles: true }));
    expect(view.dialog().model.preview.message).toContain("编译配置已变化");
    view.surface.close(); view.surface.open();
    const text = workspace.shadowRoot?.textContent ?? "";
    expect(text).toContain("/workspace/new-working/cleanup.yaml");
    expect(text).toContain("/workspace/new-working/sample/cleanup.yaml");
    expect(text).not.toContain("/workspace/Phoenix");
    expect(view.log).toHaveBeenCalledWith(expect.stringContaining("仅从当前工作目录向下：/workspace/new-working；发现 2 份"));
    expect(view.execute).not.toHaveBeenCalled();
  });
});
