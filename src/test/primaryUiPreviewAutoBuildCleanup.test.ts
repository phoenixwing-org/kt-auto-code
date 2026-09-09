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

interface DialogFixture extends HTMLElement { model: KtcCleanupDialogModel; open: boolean; openedMode: string; }
afterEach(() => document.body.replaceChildren());

function setup() {
  let state = createDefaultPreviewAutoBuildState();
  const log = vi.fn<(line: string) => void>();
  const execute = vi.fn();
  const updateRules = vi.fn((value: string) => { state = { ...state, cleanupPatternsYaml: value }; });
  const surface = createPreviewAutoBuildCleanupSurface({ state: () => state, log, execute, updateRules });
  const dialog = () => document.querySelector<DialogFixture>("#preview-auto-build-cleanup-dialog")!;
  const send = (detail: unknown) => dialog().dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail }));
  const request = (): KtcCleanupDialogRequest => ({ modeId: dialog().model.selectedModeId!, rulesYaml: dialog().model.rulesYaml,
    targetIds: dialog().model.targets.filter(({ selected, supportedModeIds }) => selected && supportedModeIds?.includes(dialog().model.selectedModeId!)).map(({ id }) => id) });
  const preview = () => { send({ kind: "preview", request: request() }); return dialog().model.preview.token!; };
  return { surface, log, execute, updateRules, dialog, send, request, preview,
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
});
