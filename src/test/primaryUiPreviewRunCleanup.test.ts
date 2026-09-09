// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcCleanupDialogModel } from "../core/cleanupContracts.js";

vi.mock("@phoenix-wing/code-core/ui", () => ({
  pnwCodeDefineNavigationTree() {},
  pnwCodeDefineCleanupDialog() {
    if (customElements.get("pnw-cleanup-dialog")) return;
    customElements.define("pnw-cleanup-dialog", class extends HTMLElement {
      model: KtcCleanupDialogModel | undefined;
      open = false;
      openedMode: string | undefined;
      showModal(modeId?: string) { this.open = true; this.openedMode = modeId; }
      close() { this.open = false; }
    });
  },
}));

import { createPreviewRunCleanupModel, createPreviewRunSurface } from "../../ui-preview/src/previewRunCleanup.js";

interface DialogFixture extends HTMLElement {
  model: KtcCleanupDialogModel;
  open: boolean;
  openedMode: string;
}

afterEach(() => document.body.replaceChildren());

describe("Preview Run shared cleanup dialog", () => {
  it("uses four explicit modes and one workspace with no initial execute token", () => {
    const model = createPreviewRunCleanupModel("/fixture/project", "git-untracked");
    expect(model.modes.map(({ id }) => id)).toEqual(["build", "objects", "obj", "git-untracked"]);
    expect(model.targets.map(({ id, path }) => ({ id, path }))).toEqual([{ id: "workspace", path: "/fixture/project" }]);
    expect(model.description).toContain("不读取或删除真实文件");
    expect(model.modes[3]!.description).toContain("不执行 reset");
    expect(model.modes.every(({ risk }) => risk === "high")).toBe(true);
    expect(model.requireHighRiskConfirmation).toBe(false);
    expect(model.highRiskConfirmationLabel).toBe("");
    expect(model.executeEnabled).toBe(false);
    expect(model.preview.token).toBeUndefined();
  });

  it("three direct cleanup leaves only log simulations without opening a dialog", () => {
    const lines: string[] = [];
    const surface = createPreviewRunSurface({ directory: () => "/fixture/project", log: (line) => lines.push(line) });
    const panel = surface.createPrimary(); document.body.append(panel);
    for (const action of ["cleanBuild", "cleanObjects", "cleanObj"]) {
      panel.dispatchEvent(new CustomEvent("ktc-run-primary-action", { detail: { action } }));
    }
    expect(document.querySelector("pnw-cleanup-dialog")).toBeNull();
    expect(lines).toEqual([
      "[Run][清理] 直接删除 build（模拟）；不弹出确认，未删除真实文件",
      "[Run][清理] 直接删除 objects（模拟）；不弹出确认，未删除真实文件",
      "[Run][清理] 直接删除 *.obj（模拟）；不弹出确认，未删除真实文件",
    ]);
  });

  it("first-row cleanup button reuses the pnw dialog, defaults to Git and logs simulated preview/execute/cancel", () => {
    const lines: string[] = [];
    const surface = createPreviewRunSurface({ directory: () => "/fixture/project", log: (line) => lines.push(line) });
    const panel = surface.createPrimary(); document.body.append(panel);
    const cleanupButton = Array.from(panel.shadowRoot!.querySelectorAll<HTMLButtonElement>(".toolbar button"))
      .find(({ textContent }) => textContent === "清理")!;
    cleanupButton.click();
    expect(document.querySelectorAll("pnw-cleanup-dialog")).toHaveLength(1);
    const dialog = document.querySelector("pnw-cleanup-dialog") as DialogFixture;
    expect(dialog.openedMode).toBe("git-untracked");
    expect(dialog.model.selectedModeId).toBe("git-untracked");
    const request = { modeId: "git-untracked", targetIds: ["workspace"], rulesYaml: "" };
    dialog.dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail: { kind: "execute", request, previewToken: "missing-preview" } }));
    expect(dialog.model.preview.state).toBe("idle");
    dialog.dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail: { kind: "preview", request } }));
    expect(dialog.model.preview.state).toBe("ready");
    expect(dialog.model.preview.items).toHaveLength(2);
    const previewToken = dialog.model.preview.token;
    dialog.dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail: { kind: "execute", request, previewToken: "stale" } }));
    expect(dialog.model.preview.state).toBe("ready");
    dialog.dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail: { kind: "execute", request, previewToken } }));
    expect(dialog.model.preview.state).toBe("complete");
    expect(lines.at(-1)).toContain("未删除真实文件，未运行 reset/clean");
    dialog.dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", { detail: { kind: "cancel" } }));
    expect(lines.at(-1)).toContain("已取消（模拟）");
    cleanupButton.click();
    expect(document.querySelectorAll("pnw-cleanup-dialog")).toHaveLength(1);
    expect(dialog.model.preview.state).toBe("idle");
  });

  it("closes old previews when directory context changes", () => {
    let directory = "/fixture/old";
    const lines: string[] = [];
    const surface = createPreviewRunSurface({ directory: () => directory, log: (line) => lines.push(line) });
    const panel = surface.createPrimary(); document.body.append(panel);
    panel.dispatchEvent(new CustomEvent("ktc-run-primary-action", { detail: { action: "openCleanup" } }));
    const dialog = document.querySelector("pnw-cleanup-dialog") as DialogFixture;
    expect(dialog.open).toBe(true);
    directory = "/fixture/new";
    surface.directoryChanged();
    expect(dialog.open).toBe(false);
    expect(lines.at(-1)).toContain("已关闭旧清理预览");
    dialog.dispatchEvent(new CustomEvent("pnw-cleanup-dialog-action", {
      detail: { kind: "preview", request: { modeId: "build", targetIds: ["workspace"], rulesYaml: "" } },
    }));
    expect(dialog.model.preview.state).toBe("idle");
    expect(lines.at(-1)).toContain("旧预览已取消");
  });
});
