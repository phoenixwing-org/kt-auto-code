import { afterEach, expect, it, vi } from "vitest";
import { PnwCleanupDialog } from "@phoenix-wing/code-core/ui";
import {
  createPreviewAutoBuildCleanupSurface,
  type PreviewAutoBuildCleanupMode,
} from "../../ui-preview/src/previewAutoBuildCleanup.js";
import { createDefaultPreviewAutoBuildState } from "../../ui-preview/src/previewAutoBuildState.js";
import type { KtcCleanupYamlWorkspace } from "../../src/ui/KtcCleanupYamlWorkspace.js";

// Deliberately outside the default src/**/*.test.ts suite: this tests the real
// sibling Wing public component, with no mocked element or Registry fallback.
// All execution callbacks remain in-memory spies; no filesystem/Git API is used.
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

function setup(mode: PreviewAutoBuildCleanupMode = "rules") {
  let state = createDefaultPreviewAutoBuildState();
  const execute = vi.fn();
  const log = vi.fn();
  const surface = createPreviewAutoBuildCleanupSurface({
    state: () => state,
    execute,
    log,
    updateRules: (value) => { state = { ...state, cleanupPatternsYaml: value }; },
  });
  surface.open(mode);
  const dialog = document.querySelector<PnwCleanupDialog>("#preview-auto-build-cleanup-dialog");
  if (!dialog?.shadowRoot) throw new Error("Real Wing cleanup dialog was not mounted");
  const shadow = dialog.shadowRoot;
  const element = <T extends HTMLElement>(selector: string): T => {
    const node = shadow.querySelector<T>(selector);
    if (!node) throw new Error("Missing real Wing cleanup element: " + selector);
    return node;
  };
  return { surface, dialog, shadow, execute, log, element };
}

it("real Wing rules dialog renders ROOT/work targets and executes only an in-memory sample", () => {
  const view = setup();
  expect(view.dialog).toBeInstanceOf(PnwCleanupDialog);
  expect(view.shadow.querySelector(".pnw-cleanup-confirm")).toBeNull();
  expect(view.shadow.querySelectorAll(".pnw-cleanup-target")).toHaveLength(2);
  expect(view.element<HTMLButtonElement>(".pnw-cleanup-execute").disabled).toBe(true);

  view.element<HTMLButtonElement>(".pnw-cleanup-preview-action").click();
  expect(view.dialog.model.preview.items).toHaveLength(6);
  expect(view.element<HTMLButtonElement>(".pnw-cleanup-execute").disabled).toBe(false);
  view.element<HTMLButtonElement>(".pnw-cleanup-execute").click();

  expect(view.execute).toHaveBeenCalledExactlyOnceWith("rules");
  expect(view.dialog.model.preview.message).toContain("未删除真实文件");
});

it("real Wing Header has one copy of each action and four independently persistent collapsible blocks", () => {
  const view = setup();
  expect(view.dialog.model).toMatchObject({ actionsPlacement: "header", collapsibleSections: true, modePresentation: "radio" });
  expect(view.element<HTMLElement>(".pnw-cleanup-footer").hidden).toBe(true);
  expect(view.shadow.querySelectorAll(".pnw-cleanup-footer button")).toHaveLength(0);
  for (const name of ["cancel", "preview-action", "execute"]) {
    expect(view.shadow.querySelectorAll(`.pnw-cleanup-${name}`)).toHaveLength(1);
    expect(view.element(`.pnw-cleanup-${name}`).parentElement?.className).toBe("pnw-cleanup-header-actions");
  }
  const hostActions = view.shadow.querySelector<HTMLSlotElement>('slot[name="header-actions"]')!.assignedElements();
  expect(hostActions.map((button) => button.textContent)).toEqual(["在 VS Code 中编辑", "探测配置"]);
  const workspace = view.dialog.querySelector<KtcCleanupYamlWorkspace>("ktc-cleanup-yaml-workspace")!;
  const blocks = () => [workspace.shadowRoot!.querySelector<HTMLDetailsElement>("details")!,
    ...Array.from(view.shadow.querySelectorAll<HTMLDetailsElement>("details"))];
  expect(blocks()).toHaveLength(4);
  expect(blocks().map((block) => block.querySelector("summary")?.textContent)).toEqual([
    "配置 YAML 列表 · 2", "清理目标", "清理规则", "预览结果",
  ]);
  for (const index of [0, 2]) {
    const summary = blocks()[index]!.querySelector("summary")!;
    const text = document.createElement("span"); text.textContent = summary.textContent;
    summary.replaceChildren(text); text.click();
  }
  expect(blocks().map((block) => block.open)).toEqual([false, true, false, true]);
  view.element<HTMLButtonElement>(".pnw-cleanup-preview-action").click();
  expect(blocks().map((block) => block.open)).toEqual([false, true, false, true]);
  view.dialog.querySelector<HTMLButtonElement>('[data-cleanup-yaml-action="discover"]')!.click();
  expect(blocks().map((block) => block.open)).toEqual([false, true, false, true]);
  view.surface.close(); view.surface.open();
  expect(blocks().map((block) => block.open)).toEqual([false, true, false, true]);
  expect(view.dialog.querySelectorAll('[slot="header-actions"]')).toHaveLength(2);
  expect(view.dialog.querySelectorAll('[slot="workspace"]')).toHaveLength(1);
  expect(view.execute).not.toHaveBeenCalled();
});

it("real Wing Header actions keep rules input caret and remove stale preview while editing", () => {
  const view = setup();
  view.element<HTMLButtonElement>(".pnw-cleanup-preview-action").click();
  const textarea = view.element<HTMLTextAreaElement>("textarea");
  const execute = view.element<HTMLButtonElement>(".pnw-cleanup-execute");
  const workspace = view.dialog.querySelector<KtcCleanupYamlWorkspace>("ktc-cleanup-yaml-workspace")!;
  // happy-dom 15 incorrectly walks through Document.host when another shadow root
  // owns focus. A browser returns null for this unfocused sibling; keep the real
  // dialog.activeElement/caret assertions below, stubbing only that unrelated read.
  vi.spyOn(workspace.shadowRoot!, "activeElement", "get").mockReturnValue(null);
  textarea.focus(); textarea.value += "\n# input";
  textarea.setSelectionRange(2, 5, "backward"); textarea.scrollTop = 12;
  textarea.dispatchEvent(new Event("input"));
  expect(view.element("textarea")).toBe(textarea);
  expect(view.shadow.activeElement).toBe(textarea);
  expect([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection, textarea.scrollTop]).toEqual([2, 5, "backward", 12]);
  expect(view.dialog.model.preview).toEqual({ state: "idle", items: [] });
  expect(execute.disabled).toBe(true);
  expect(view.shadow.querySelector(".pnw-cleanup-items")).toBeNull();
  view.dialog.querySelector<HTMLButtonElement>('[data-cleanup-yaml-action="edit-rules"]')!.click();
  expect(view.log).toHaveBeenCalledWith(expect.stringContaining(`[YAML 草稿（模拟）]\n${textarea.value}`));
  expect(view.execute).not.toHaveBeenCalled();
});

it("real Wing Git mode preserves AutoBuild's extra confirmation before execute", () => {
  const view = setup("git-force");
  expect(view.element<HTMLInputElement>(".pnw-cleanup-confirm input").disabled).toBe(true);
  view.element<HTMLButtonElement>(".pnw-cleanup-preview-action").click();
  expect(view.element<HTMLButtonElement>(".pnw-cleanup-execute").disabled).toBe(true);
  expect(view.element<HTMLInputElement>(".pnw-cleanup-confirm input").disabled).toBe(false);
  view.element<HTMLButtonElement>(".pnw-cleanup-execute").click();
  expect(view.execute).not.toHaveBeenCalled();

  const confirm = view.element<HTMLInputElement>(".pnw-cleanup-confirm input");
  confirm.checked = true;
  confirm.dispatchEvent(new Event("change"));
  expect(view.element<HTMLButtonElement>(".pnw-cleanup-execute").disabled).toBe(false);
  view.element<HTMLButtonElement>(".pnw-cleanup-execute").click();
  expect(view.execute).toHaveBeenCalledExactlyOnceWith("git-force");
});

it("real Wing rules cache, mode/target invalidation and Escape cancel remain connected", () => {
  const view = setup();
  const rules = view.element<HTMLTextAreaElement>("textarea");
  rules.value = "delete:\n  files:\n    - '*.obj'";
  rules.dispatchEvent(new Event("input"));
  view.surface.close();
  view.surface.open();
  expect(view.element<HTMLTextAreaElement>("textarea").value).toContain("'*.obj'");

  view.element<HTMLButtonElement>(".pnw-cleanup-preview-action").click();
  const target = view.element<HTMLInputElement>(".pnw-cleanup-target input");
  target.checked = false;
  target.dispatchEvent(new Event("change"));
  expect(view.element<HTMLButtonElement>(".pnw-cleanup-execute").disabled).toBe(true);

  const mode = view.element<HTMLInputElement>('input[type="radio"][value="cmake"]');
  mode.checked = true;
  mode.dispatchEvent(new Event("change"));
  expect(view.shadow.querySelector("textarea")).toBeNull();
  expect(view.element<HTMLButtonElement>(".pnw-cleanup-execute").disabled).toBe(true);
  view.element<HTMLButtonElement>(".pnw-cleanup-preview-action").click();
  view.element<HTMLDialogElement>("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));

  expect(view.log).toHaveBeenCalledWith(expect.stringContaining("已取消清理（模拟）"));
  expect(view.execute).not.toHaveBeenCalled();
  expect(view.element<HTMLDialogElement>("dialog").open).toBe(false);
});
