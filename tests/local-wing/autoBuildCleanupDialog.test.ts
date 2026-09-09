import { afterEach, expect, it, vi } from "vitest";
import { PnwCleanupDialog } from "@phoenix-wing/code-core/ui";
import {
  createPreviewAutoBuildCleanupSurface,
  type PreviewAutoBuildCleanupMode,
} from "../../ui-preview/src/previewAutoBuildCleanup.js";
import { createDefaultPreviewAutoBuildState } from "../../ui-preview/src/previewAutoBuildState.js";

// Deliberately outside the default src/**/*.test.ts suite: this tests the real
// sibling Wing public component, with no mocked element or Registry fallback.
// All execution callbacks remain in-memory spies; no filesystem/Git API is used.
afterEach(() => document.body.replaceChildren());

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

  const mode = view.element<HTMLSelectElement>("select");
  mode.value = "cmake";
  mode.dispatchEvent(new Event("change"));
  expect(view.shadow.querySelector("textarea")).toBeNull();
  expect(view.element<HTMLButtonElement>(".pnw-cleanup-execute").disabled).toBe(true);
  view.element<HTMLButtonElement>(".pnw-cleanup-preview-action").click();
  view.element<HTMLDialogElement>("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));

  expect(view.log).toHaveBeenCalledWith(expect.stringContaining("已取消清理（模拟）"));
  expect(view.execute).not.toHaveBeenCalled();
  expect(view.element<HTMLDialogElement>("dialog").open).toBe(false);
});
